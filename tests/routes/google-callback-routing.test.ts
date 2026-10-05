import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

const realRequire = createRequire(path.join(process.cwd(), "package.json"));
const origin = "https://example.test";
const mobileCookie = "__khasigpt_mobile_google_attempt";

function harness() {
  const jar = new Map<string, string>([[mobileCookie, "old-android-attempt"], ["__Secure-authjs.callback-url", `${origin}/chat`]]);
  let location = `${origin}/chat`; let status = 302; let authCalls = 0;
  const modules = new Map<string, any>();
  const mocks: Record<string, any> = {
    "next/headers": { cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined }) },
    "@/app/(auth)/auth": {
      GET: async () => { authCalls++; return new Response(null, { status, headers: { Location: location, "Set-Cookie": "authjs.session-token=fixture; Path=/; HttpOnly" } }); },
      POST: async () => Response.json({ delegated: true }),
    },
  };
  function load(file: string): any {
    if (modules.has(file)) return modules.get(file);
    const exports = {}; modules.set(file, exports);
    vm.runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, { exports, Response, Headers, Request, URL, Date, Buffer, console,
      process: { env: { NODE_ENV: "production", GOOGLE_CLIENT_ID: "fixture-client", AUTH_SECRET: "disposable-auth-secret" } },
      require: (name: string) => {
        if (name === "server-only") return {};
        if (name in mocks) return mocks[name];
        if (name === "@/lib/referrals/rules") return { normalizeReferralCode: () => null };
        if (name.startsWith("@/lib/")) return load(`${name.slice(2)}.ts`);
        return realRequire(name);
      },
    }); return exports;
  }
  return { load, jar, authCalls: () => authCalls, result: (url: string, code = 302) => { location = url; status = code; } };
}
const route = "app/(auth)/api/auth/[...nextauth]/route.ts";
const callback = (code: string, extra = "") => new Request(`${origin}/api/auth/callback/google?code=${code}${extra}`);

test("a stale Android attempt cannot override the successful web Google destination or session cookies", async () => {
  const h = harness(); const auth = h.load(route);
  const result = await auth.GET(callback("first-web-code"));
  expect(h.authCalls()).toBe(1); expect(result.status).toBe(302);
  expect(result.headers.get("location")).toBe(`${origin}/chat`);
  expect(result.headers.get("set-cookie")).toContain("authjs.session-token=fixture");
  expect(result.cookies.get(mobileCookie)).toMatchObject({ value: "", maxAge: 0 });
});

test("callback duplicates use the explicit same-origin Auth.js destination, never the old mobile marker", async () => {
  const h = harness(); const auth = h.load(route);
  h.jar.set("__auth_callback_code", "cookie-duplicate");
  expect((await auth.GET(callback("cookie-duplicate"))).headers.get("location")).toBe(`${origin}/chat`);
  expect(h.authCalls()).toBe(0);
  h.jar.delete("__auth_callback_code");
  await auth.GET(callback("memory-duplicate"));
  expect((await auth.GET(callback("memory-duplicate"))).headers.get("location")).toBe(`${origin}/chat`);
  expect(h.authCalls()).toBe(1);
});

test("auth errors stay errors and an explicitly selected legacy native callback stays native", async () => {
  const h = harness(); const auth = h.load(route);
  h.result(`${origin}/login?error=OAuthCallbackError`);
  expect((await auth.GET(callback("rejected-google-code"))).headers.get("location")).toBe(`${origin}/login?error=OAuthCallbackError`);
  const explicit = `${origin}/api/mobile/auth/oauth-complete?attempt=explicit-native`;
  h.result(explicit);
  expect((await auth.GET(callback("explicit-native-code"))).headers.get("location")).toBe(explicit);
  h.jar.set("__Secure-authjs.callback-url", explicit);
  expect((await auth.GET(callback("explicit-native-code"))).headers.get("location")).toBe(explicit);
});

test("duplicate callbacks reject external destinations and support non-secure development callback cookies", async () => {
  const h = harness(); const auth = h.load(route);
  h.jar.set("__auth_callback_code", "duplicate");
  h.jar.set("__Secure-authjs.callback-url", "https://attacker.example/steal");
  expect((await auth.GET(callback("duplicate"))).headers.get("location")).toBe(`${origin}/`);
  h.jar.delete("__Secure-authjs.callback-url"); h.jar.set("authjs.callback-url", "/chat?new=1");
  expect((await auth.GET(callback("duplicate"))).headers.get("location")).toBe(`${origin}/chat?new=1`);
  expect((await auth.GET(callback("duplicate", "&callbackUrl=https://attacker.example/steal"))).headers.get("location")).toBe(`${origin}/`);
});

test("direct Android OAuth carries its attempt in signed state and retires the obsolete root cookie", async () => {
  const h = harness(); const start = h.load("app/api/mobile/auth/google-start/route.ts");
  const response = await start.GET(new Request(`${origin}/api/mobile/auth/google-start?attempt=new-android-attempt`));
  const google = new URL(response.headers.get("location"));
  expect(google.origin).toBe("https://accounts.google.com");
  expect(google.searchParams.get("redirect_uri")).toBe(`${origin}/api/mobile/auth/google-callback`);
  expect(h.load("lib/mobile-google-oauth-state.ts").verifyMobileGoogleOAuthState(google.searchParams.get("state"))).toMatchObject({ attemptId: "new-android-attempt" });
  expect(response.cookies.get(mobileCookie)).toMatchObject({ value: "", maxAge: 0, path: "/" });
});

test("the deployed HTTP duplicate boundary ignores an old mobile cookie", async ({ request, baseURL }) => {
  test.skip(process.env.ISOLATED_TEST_RUN !== "1", "Requires the isolated server.");
  const code = "disposable-cookie-duplicate";
  const response = await request.get(`/api/auth/callback/google?code=${code}`, {
    headers: { Cookie: `${mobileCookie}=old-attempt; __auth_callback_code=${code}; authjs.callback-url=${encodeURIComponent(`${baseURL}/chat`)}` },
    maxRedirects: 0,
  });
  expect(response.headers().location).toBe(`${baseURL}/chat`);
});
