import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

const requireModule = createRequire(path.join(process.cwd(), "package.json"));

function routeHarness(userId: string | null, enabled = true) {
  const calls: unknown[] = [];
  const exports: Record<string, any> = {};
  const mocks: Record<string, unknown> = {
    "@/lib/mobile-auth-session": {
      getMobileSession: async () => userId ? { user: { id: userId, role: "regular" } } : null,
    },
    "@/lib/forum/config": { isForumEnabledForRole: async () => enabled },
    "@/lib/forum/api-helpers": {
      forumDisabledResponse: () => Response.json({ error: "Disabled" }, { status: 403 }),
      forumErrorResponse: () => new Response(null, { status: 500 }),
    },
    "@/lib/forum/service": {
      listForumBlockedUsers: async (id: string) => { calls.push(id); return []; },
      setForumUserBlock: async (input: unknown) => { calls.push(input); },
    },
  };
  const code = ts.transpileModule(readFileSync("app/api/forum/blocks/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, Response,
    require: (name: string) => name in mocks ? mocks[name] : requireModule(name),
  });
  return { route: exports, calls };
}

test("forum block handlers reject anonymous or disabled access before reading or mutating blocks", async () => {
  for (const [userId, enabled, status] of [[null, true, 401], ["actor", false, 403]] as const) {
    const harness = routeHarness(userId, enabled);
    for (const method of ["GET", "POST", "DELETE"]) {
      const response = await harness.route[method](new Request("https://example.test/api/forum/blocks", { method }));
      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(status);
    }
    expect(harness.calls).toEqual([]);
  }
});

test("forum block handlers bind reads and valid mutations to the authenticated actor", async () => {
  const harness = routeHarness("actor");
  const target = "00000000-0000-4000-8000-000000000001";
  expect((await harness.route.GET(new Request("https://example.test/api/forum/blocks"))).status).toBe(200);
  for (const method of ["POST", "DELETE"]) {
    const response = await harness.route[method](new Request("https://example.test/api/forum/blocks", {
      method, body: JSON.stringify({ userId: target }),
    }));
    expect(response.status).toBe(200);
  }
  expect(harness.calls).toEqual([
    "actor",
    { blockerId: "actor", blockedId: target, blocked: true },
    { blockerId: "actor", blockedId: target, blocked: false },
  ]);
  const invalid = await harness.route.POST(new Request("https://example.test/api/forum/blocks", { method: "POST", body: "{}" }));
  expect(invalid.status).toBe(400);
  expect(harness.calls).toHaveLength(3);
});
