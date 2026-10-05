import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

const actionFiles = ["app/(admin)/actions.ts", "app/(admin)/admin/translations/translation-actions.ts", "app/(admin)/admin/account-deletion/actions.ts"];
const actorId = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";

function harness() {
  let session: any = { user: { id: actorId, role: "admin" } };
  let current: any = { id: actorId, role: "admin", isActive: true };
  let sessionFails = false;
  let lookupFails = false;
  let hangSession = false;
  let hangLookup = false;
  const calls = { auth: 0, lookup: 0, effects: [] as string[], deadlines: [] as number[] };
  const warnings: string[] = [];
  const modules = new Map<string, any>();
  const mocks: Record<string, any> = {
    "@/app/(auth)/auth": { auth: async () => {
      calls.auth++;
      if (sessionFails) throw new Error("private-fixture-secret");
      if (hangSession) return new Promise(() => {});
      return session;
    } },
    "@/lib/db/auth-queries": { getAuthUserRoleById: async (id: string) => {
      expect(id).toBe(actorId);
      calls.lookup++;
      if (lookupFails) throw new Error("private-fixture-secret");
      if (hangLookup) return new Promise(() => {});
      return current;
    } },
    "next/navigation": { redirect: (url: string) => { throw new Error(`redirect:${url}`); } },
    "next/server": { after: () => { calls.effects.push("after"); } },
  };
  function load(file: string): any {
    if (modules.has(file)) return modules.get(file);
    const exports: Record<string, any> = {};
    modules.set(file, exports);
    vm.runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
      exports, process: { env: {} }, FormData, Date,
      console: { warn: (message: string) => warnings.push(message), error: (message: string) => warnings.push(message) },
      setTimeout: (fn: () => void, ms: number) => { calls.deadlines.push(ms); return setTimeout(fn, ms); }, clearTimeout,
      require: (name: string) => {
        if (name === "server-only") return {};
        if (name in mocks) return mocks[name];
        if (name === "@/lib/security/admin-session" || name === "@/lib/utils/async") return load(`${name.slice(2)}.ts`);
        return new Proxy({}, { get: (_object, key: string) => (..._args: unknown[]) => {
          calls.effects.push(`${name}:${key}`);
          if (key === "markAccountDeletionRequestsViewed") return Promise.resolve({ markedCount: 1 });
          return Promise.resolve(undefined);
        } });
      },
    }, { filename: file });
    return exports;
  }
  return { calls, warnings, load,
    anonymous: () => { session = null; }, regular: () => { session.user.role = "regular"; },
    missingId: () => { delete session.user.id; }, revoked: () => { current.role = "regular"; },
    inactive: () => { current.isActive = false; }, missing: () => { current = null; },
    failSession: () => { sessionFails = true; }, failLookup: () => { lookupFails = true; },
    hangSession: () => { hangSession = true; }, hangLookup: () => { hangLookup = true; },
  };
}

test("every exported admin action denies stale, inactive, deleted and unavailable administrators before effects", async () => {
  const scenarios = ["anonymous", "regular", "missingId", "revoked", "inactive", "missing", "failSession", "failLookup"] as const;
  for (const scenario of scenarios) {
    const h = harness();
    h[scenario]();
    for (const file of actionFiles) {
      const actions = Object.entries(h.load(file));
      expect(actions.length, file).toBeGreaterThan(0);
      for (const [name, action] of actions) {
        expect(typeof action, `${file}:${name}`).toBe("function");
        const message = file.includes("account-deletion") ? "redirect:/" : "forbidden";
        await expect((action as (input: object) => Promise<unknown>)({}), `${file}:${name}:${scenario}`).rejects.toThrow(message);
        expect(h.calls.effects, `${file}:${name}:${scenario}`).toEqual([]);
      }
    }
    if (["anonymous", "regular", "missingId", "failSession"].includes(scenario)) expect(h.calls.lookup).toBe(0);
    expect(h.warnings.join(" ")).not.toContain("private-fixture-secret");
  }
});

test("active administrators retain role, translation and account-deletion mutations", async () => {
  const h = harness();
  await h.load(actionFiles[0]).setUserRoleAction({ userId: targetId, role: "regular" });
  expect(h.calls.effects).toContain("@/lib/db/queries:updateUserRole");
  const translation = new FormData();
  translation.set("keyId", targetId); translation.set("defaultText", "Disposable fixture");
  await h.load(actionFiles[1]).saveDefaultTextAction(translation);
  expect(h.calls.effects).toContain("@/lib/db/queries:updateTranslationDefaultText");
  const deletion = new FormData(); deletion.set("requestId", targetId);
  await expect(h.load(actionFiles[2]).markDeletionRequestViewedAction(deletion)).rejects.toThrow("redirect:/admin/account-deletion?notice=updated");
  expect(h.calls.effects).toContain("@/lib/db/queries:markAccountDeletionRequestsViewed");
  expect(h.calls.lookup).toBe(3);
});

test("a successful action does not cache authority for the next action", async () => {
  const h = harness();
  const actions = h.load(actionFiles[0]);
  await actions.setUserRoleAction({ userId: targetId, role: "regular" });
  const effects = h.calls.effects.length;
  h.revoked();
  await expect(actions.setUserRoleAction({ userId: targetId, role: "admin" })).rejects.toThrow("forbidden");
  expect(h.calls.effects).toHaveLength(effects);
  expect(h.calls.lookup).toBe(2);
});

test("hung session and role lookups fail closed within their actual deadlines", async () => {
  for (const scenario of ["hangSession", "hangLookup"] as const) {
    const h = harness(); h[scenario]();
    const start = Date.now();
    expect(await h.load("lib/security/admin-session.ts").getActiveAdminSession()).toBeNull();
    expect(Date.now() - start).toBeLessThan(6000);
    expect(h.calls.deadlines).toContain(scenario === "hangSession" ? 4000 : 2500);
    expect(h.calls.effects).toEqual([]);
  }
});
