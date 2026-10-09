import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

const requireModule = createRequire(path.join(process.cwd(), "package.json"));

function loadRoute(result: unknown) {
  const exports: Record<string, any> = {};
  const mocks: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/db/queries": { verifyUserEmailByToken: async () => result },
  };
  const code = ts.transpileModule(readFileSync("app/api/mobile/auth/verify-email/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, Response,
    require: (name: string) => name in mocks ? mocks[name] : requireModule(name),
  });
  return exports;
}

test("mobile email verification returns only the status, never the user row", async () => {
  for (const status of ["verified", "already_verified"]) {
    const route = loadRoute({
      status,
      user: { id: "user-1", password: "$2a$10$hash", role: "admin", locationLatitude: 25.57 },
    });
    const response: Response = await route.POST(new Request("https://example.test/api/mobile/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: "token-value" }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status });
    expect(response.headers.get("cache-control")).toBe("no-store");
  }
});
