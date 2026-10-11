import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

const realRequire = createRequire(path.join(process.cwd(), "package.json"));
const id = "11111111-1111-4111-8111-111111111111";
const secret = "disposable-session-security-secret";

function harness() {
  let callbacks: any;
  let token: any = { id, role: "admin", sessionVersion: 0 };
  let record: any = { id, isActive: true, role: "admin", sessionVersion: 0 };
  let unavailable = false;
  const modules = new Map<string, any>();
  const mocks: Record<string, any> = {
    "next-auth": { default: (config: any) => {
      callbacks = config.callbacks;
      const session = async () => {
        const validated = await callbacks.jwt({ token });
        return validated ? callbacks.session({ session: { user: {} }, token: validated }) : null;
      };
      return { auth: session, handlers: { GET: async () => Response.json(await session()), POST: async () => Response.json(await session()) } };
    } },
    "next-auth/providers/credentials": { default: (config: any) => config },
    "next-auth/providers/google": { default: () => ({}) },
    "@/lib/db/auth-queries": {
      getAuthUserRoleById: async () => { if (unavailable) throw new Error("private-fixture-secret"); return record; },
      getAuthUserById: async () => record,
    },
    "@/lib/security/guest-login": { isGuestLoginEnabled: () => false },
    "./auth.config": { authConfig: {} },
  };
  function load(file: string): any {
    if (modules.has(file)) return modules.get(file);
    const exports = {}; modules.set(file, exports);
    vm.runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, { exports, Buffer, Date, Response, setTimeout, clearTimeout, process: { env: { AUTH_SECRET: secret } },
      console: { warn: () => {}, error: () => {} }, require: (name: string) => {
        if (name === "server-only") return {};
        if (name in mocks) return mocks[name];
        if (["@/lib/mobile-auth-token", "@/lib/security/session-version", "@/lib/security/auth-unavailable", "@/lib/utils/async"].includes(name)) return load(`${name.slice(2)}.ts`);
        if (name === "bcrypt-ts") return realRequire(name);
        if (name.startsWith("node:")) return realRequire(name);
        return {};
      },
    }); return exports;
  }
  return { load, callbacks: () => callbacks, token: () => token,
    setToken: (value: any) => { token = value; }, setRecord: (value: any) => { record = value; }, fail: () => { unavailable = true; }, recover: () => { unavailable = false; },
  };
}

test("browser validation rejects revoked, malformed, inactive and deleted sessions on every read", async () => {
  for (const current of [1, 2, 99]) {
    const h = harness(); const auth = h.load("app/(auth)/auth.ts");
    expect((await auth.auth()).user.id).toBe(id);
    h.setRecord({ id, isActive: true, role: "admin", sessionVersion: current });
    expect(await auth.auth()).toBeNull();
    expect(h.token().sessionVersion).toBe(0);
  }
  for (const version of [null, -1, 0.5, "0", Number.NaN]) {
    const h = harness(); const auth = h.load("app/(auth)/auth.ts");
    h.setToken({ id, sessionVersion: version }); expect(await auth.auth()).toBeNull();
  }
  for (const record of [null, { id, isActive: false, sessionVersion: 0 }]) {
    const h = harness(); const auth = h.load("app/(auth)/auth.ts"); h.setRecord(record);
    expect(await auth.auth()).toBeNull();
  }
});

test("legacy cookies remain version zero and profile refresh cannot upgrade stolen sessions", async () => {
  const h = harness(); const auth = h.load("app/(auth)/auth.ts");
  h.setToken({ id, role: "admin", dateOfBirth: null, imageVersion: null, firstName: null, lastName: null, roleRefreshedAt: Date.now(), dbRefreshedAt: Date.now() });
  expect((await auth.auth()).user.sessionVersion).toBe(0);
  h.setRecord({ id, isActive: true, role: "admin", sessionVersion: 1 });
  const refreshed = await h.callbacks().jwt({ token: h.token(), trigger: "update", session: { user: { sessionVersion: 1 } } });
  expect(refreshed).toBeNull();
  expect(await auth.auth()).toBeNull();
  const fresh = await h.callbacks().jwt({ token: {}, user: { id, role: "admin", sessionVersion: 1 } }); h.setToken(fresh);
  expect((await auth.auth()).user.sessionVersion).toBe(1);
});

test("an auth database outage denies access with 503 without destroying the original session", async () => {
  const h = harness(); const auth = h.load("app/(auth)/auth.ts"); h.fail();
  await expect(auth.auth()).rejects.toMatchObject({ status: 503, code: "auth_lookup_unavailable" });
  const response = await auth.GET(new Request("https://example.test/api/auth/session"));
  expect(response.status).toBe(503); expect(response.headers.get("set-cookie")).toBeNull();
  expect(await response.json()).not.toHaveProperty("user");
  h.recover(); expect((await auth.auth()).user.id).toBe(id);
});

test("mobile access tokens bind a credential version and reject handoff/preview token confusion", () => {
  const h = harness(); const tokens = h.load("lib/mobile-auth-token.ts");
  const fresh = tokens.createMobileAuthToken(id, { persistent: true, sessionVersion: 3 });
  expect(tokens.verifyMobileAuthToken(fresh)).toEqual({ userId: id, sessionVersion: 3 });
  expect(tokens.verifyMobileAuthToken(`${fresh}.extra`)).toBeNull();
  const handoff = tokens.createMobileOAuthHandoffToken(id, 3);
  expect(tokens.verifyMobileOAuthHandoffToken(handoff)).toMatchObject({ userId: id, sessionVersion: 3 });
  const secondHandoff = tokens.createMobileOAuthHandoffToken(id, 3);
  const firstNonce = JSON.parse(Buffer.from(handoff.split(".")[0], "base64url").toString()).nonce;
  const secondNonce = JSON.parse(Buffer.from(secondHandoff.split(".")[0], "base64url").toString()).nonce;
  expect(firstNonce).toMatch(/^[0-9a-f-]{36}$/);
  expect(firstNonce).not.toBe(secondNonce);
  expect(tokens.verifyMobileAuthToken(handoff)).toBeNull();
  expect(tokens.verifyMobileOAuthHandoffToken(fresh)).toBeNull();
  expect(tokens.verifyMobileAuthToken(tokens.createJobPreviewToken(id))).toBeNull();
  for (const payload of [{ sub: id, exp: Date.now() + 60000 }, { sub: id, exp: Date.now() + 60000, type: "mobile-access" }, { sub: id, exp: Date.now(), type: "mobile-access", sessionVersion: 0 }]) {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signed = `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
    expect(tokens.verifyMobileAuthToken(signed)).toEqual("type" in payload ? null : { userId: id, sessionVersion: 0 });
  }
  expect(() => tokens.createMobileAuthToken(id, { sessionVersion: -1 })).toThrow();
});
