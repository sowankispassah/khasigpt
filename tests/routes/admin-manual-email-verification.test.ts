import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

const actorId = "875f2bd9-7020-41d3-a253-a72cab386e64";
const userId = "975f2bd9-7020-41d3-a253-a72cab386e64";
type Account = { id: string; isActive: boolean; emailVerificationPending: boolean };

function loadModule(file: string, mocks: Record<string, unknown>) {
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync(path.join(process.cwd(), file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (name: string) => {
      if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`);
      return mocks[name];
    },
    console: { error: () => {} },
    Date,
  });
  return exports;
}

function verificationHarness(account: Account | null, failAudit = false) {
  let saved = account ? { ...account } : null;
  let tokens = account ? 2 : 0;
  const audits: any[] = [];
  const matches = (row: Account | null, predicate: any): boolean => Boolean(row && (
    predicate.all ? predicate.all.every((part: any) => matches(row, part)) : row[predicate.field as keyof Account] === predicate.value
  ));
  const db = {
    transaction: async (work: (tx: any) => Promise<unknown>) => {
      let draft = saved ? { ...saved } : null;
      let draftTokens = tokens;
      const draftAudits: any[] = [];
      const result = await work({
        update: () => ({ set: (patch: Partial<Account>) => ({ where: (predicate: any) => ({ returning: async () => {
          if (!draft || !matches(draft, predicate)) return [];
          draft = { ...draft, ...patch };
          return [draft];
        } }) }) }),
        select: () => ({ from: () => ({ where: (predicate: any) => ({ limit: async () => matches(draft, predicate) ? [draft] : [] }) }) }),
        delete: () => ({ where: async (predicate: any) => { if (predicate.value === userId) draftTokens = 0; } }),
        insert: () => ({ values: async (entry: unknown) => {
          if (failAudit) throw new Error("audit unavailable");
          draftAudits.push(entry);
        } }),
      });
      saved = draft;
      tokens = draftTokens;
      audits.push(...draftAudits);
      return result;
    },
  };
  const service = loadModule("lib/db/admin-user-email-verification.ts", {
    "server-only": {},
    "drizzle-orm": { eq: (field: string, value: unknown) => ({ field, value }), and: (...all: unknown[]) => ({ all }) },
    "@/lib/db/schema": { user: { id: "id", isActive: "isActive", emailVerificationPending: "emailVerificationPending" }, emailVerificationToken: { userId: "userId" }, auditLog: {} },
    "@/lib/db/admin-database": { withAdminDatabase: (_name: string, work: (db: unknown) => unknown) => work(db) },
  });
  return { verify: service.verifyUserEmailForAdmin, state: () => ({ saved, tokens, audits }) };
}

function routeHarness(actor: { id: string } | null, verify: (input: unknown) => Promise<unknown>) {
  class FakeChatSDKError extends Error {}
  return loadModule("app/api/admin/users/[id]/route.ts", {
    "next/server": { NextResponse: { json: (data: unknown, init?: ResponseInit) => Response.json(data, init) } },
    "@/lib/api/cache": { noStoreHeaders: () => ({ "Cache-Control": "no-store" }) },
    "@/lib/db/admin-user-email-verification": { verifyUserEmailForAdmin: verify },
    "@/lib/db/queries": {},
    "@/lib/errors": { ChatSDKError: FakeChatSDKError },
    "@/lib/security/admin-api-auth": { requireAdminApiUser: async () => actor },
    "@/lib/utils/async": { withTimeout: (promise: unknown) => promise },
  }).PATCH;
}

function request(body: unknown) {
  return new Request("http://localhost/api/admin/users/test", { method: "PATCH", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
}

test("manual verification activates pending accounts, consumes links, and records the actor", async () => {
  const harness = verificationHarness({ id: userId, isActive: false, emailVerificationPending: true });
  const result = await harness.verify({ actorId, userId });
  expect(result).toMatchObject({ isActive: true, emailVerificationPending: false });
  expect(harness.state().tokens).toBe(0);
  expect(harness.state().audits).toMatchObject([{ actorId, subjectUserId: userId, action: "user.email.verify_manual" }]);
});

test("stale verification cannot restore an already verified suspended account or duplicate its audit", async () => {
  const harness = verificationHarness({ id: userId, isActive: false, emailVerificationPending: false });
  expect(await harness.verify({ actorId, userId })).toMatchObject({ isActive: false, emailVerificationPending: false });
  expect(harness.state().audits).toHaveLength(0);
  const pending = verificationHarness({ id: userId, isActive: false, emailVerificationPending: true });
  await pending.verify({ actorId, userId });
  await pending.verify({ actorId, userId });
  expect(pending.state().audits).toHaveLength(1);
});

test("failed audit rolls back verification and token cleanup", async () => {
  const harness = verificationHarness({ id: userId, isActive: false, emailVerificationPending: true }, true);
  await expect(harness.verify({ actorId, userId })).rejects.toThrow("audit unavailable");
  expect(harness.state()).toMatchObject({ saved: { isActive: false, emailVerificationPending: true }, tokens: 2, audits: [] });
});

test("only an admin can request verification of another valid account", async () => {
  let calls = 0;
  const verify = async () => { calls++; return {}; };
  const denied = routeHarness(null, verify);
  expect((await denied(request({ verifyEmail: true }), { params: Promise.resolve({ id: userId }) })).status).toBe(403);
  const patch = routeHarness({ id: actorId }, verify);
  for (const [id, body] of [[actorId, { verifyEmail: true }], ["bad-id", { verifyEmail: true }], [userId, { verifyEmail: false }], [userId, { verifyEmail: true, isActive: true }]] as const) {
    expect((await patch(request(body), { params: Promise.resolve({ id }) })).status).toBe(400);
  }
  expect(calls).toBe(0);
});

test("verification returns only account status, with terminal failure responses", async () => {
  const harness = verificationHarness({ id: userId, isActive: false, emailVerificationPending: true });
  const patch = routeHarness({ id: actorId }, harness.verify);
  const response = await patch(request({ verifyEmail: true }), { params: Promise.resolve({ id: userId }) });
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toMatchObject({ ok: true, user: { id: userId, isActive: true, emailVerificationPending: false } });
  const missing = routeHarness({ id: actorId }, async () => null);
  expect((await missing(request({ verifyEmail: true }), { params: Promise.resolve({ id: userId }) })).status).toBe(404);
  const failed = routeHarness({ id: actorId }, async () => { throw new Error("database unavailable"); });
  expect((await failed(request({ verifyEmail: true }), { params: Promise.resolve({ id: userId }) })).status).toBe(500);
});
