import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

const origin = "https://khasigpt.com";

function loadSafeRedirect() {
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync("lib/security/safe-redirect.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, URL });
  return exports as {
    sanitizeRedirectPath: (value: string | null | undefined, origin: string, fallback?: string) => string;
    resolveRedirectUrl: (value: string | null | undefined, baseUrl: string, fallback?: string) => string;
  };
}

test("redirect sanitizer rejects inputs that normalize to another host", () => {
  const { sanitizeRedirectPath, resolveRedirectUrl } = loadSafeRedirect();
  for (const value of [
    "/.//evil.com",
    "/./\\evil.com",
    "/%2e//evil.com",
    `${origin}//evil.com`,
    `${origin}/.//evil.com/path?x=1`,
    "//evil.com",
    "/\\evil.com",
    "https://evil.com/chat",
    "javascript:alert(1)",
  ]) {
    expect(sanitizeRedirectPath(value, origin, "/chat"), value).toBe("/chat");
    expect(new URL(resolveRedirectUrl(value, origin, "/chat")).origin, value).toBe(origin);
  }
});

test("redirect sanitizer keeps ordinary same-origin paths", () => {
  const { sanitizeRedirectPath } = loadSafeRedirect();
  expect(sanitizeRedirectPath("/chat/abc?tab=1#m", origin)).toBe("/chat/abc?tab=1#m");
  expect(sanitizeRedirectPath(`${origin}/forum/thread`, origin)).toBe("/forum/thread");
  expect(sanitizeRedirectPath("profile", origin)).toBe("/profile");
  expect(sanitizeRedirectPath(null, origin, "/home")).toBe("/home");
});
