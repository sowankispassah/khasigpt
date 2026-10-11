import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

const realRequire = createRequire(path.join(process.cwd(), "package.json"));
const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "33333333-3333-4333-8333-333333333333";
const email = "owner@example.test";

type Row = Record<string, any>;
type Store = { users: Row[]; tokens: Row[] };

class FakeChatSDKError extends Error {
  readonly code: string;
  constructor(code: string, cause?: string) {
    super(code);
    this.code = code;
    this.cause = cause;
  }
}

function transpile(file: string, jsx = false) {
  return ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}),
    },
  }).outputText;
}

const userColumns = ["id", "email", "password", "sessionVersion", "role", "authProvider", "isActive", "emailVerificationPending",
  "allowPersonalKnowledge", "image", "firstName", "lastName", "dateOfBirth", "updatedAt"];
const schema = {
  user: { __table: "users", ...Object.fromEntries(userColumns.map((column) => [column, column])) },
  emailVerificationToken: { __table: "tokens", id: "id", userId: "userId", token: "token" },
  creatorReferral: {}, mobileOAuthHandoffReceipt: {}, passwordResetToken: {},
};
const drizzleOrm = {
  eq: (field: string, value: unknown) => ({ op: "eq", field, value }),
  and: (...parts: unknown[]) => ({ op: "and", parts: parts.filter(Boolean) }),
  or: (...parts: unknown[]) => ({ op: "or", parts: parts.filter(Boolean) }),
  isNull: (field: string) => ({ op: "isNull", field }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ op: "sql", text: strings.join("?"), values }),
};

function matches(row: Row, predicate: any): boolean {
  if (predicate.op === "eq") return row[predicate.field] === predicate.value;
  if (predicate.op === "and") return predicate.parts.every((part: any) => matches(row, part));
  if (predicate.op === "sql" && predicate.text === "lower(?) = ?") return String(row[predicate.values[0]]).toLowerCase() === predicate.values[1];
  throw new Error(`Unsupported predicate: ${JSON.stringify(predicate)}`);
}
const project = (row: Row, columns: Record<string, string>) =>
  Object.fromEntries(Object.entries(columns).map(([key, field]) => [key, row[field]]));
const applyPatch = (row: Row, patch: Row) => Object.fromEntries([...Object.entries(row), ...Object.entries(patch).map(([key, value]) => [key,
  value?.op === "sql" && value.text === "? + 1" ? row[value.values[0]] + 1 : value])]);

// A small in-memory Drizzle stand-in: transactions work on a draft and commit
// only when the callback resolves, like the real auth pool.
function authQueriesHarness(users: Row[], tokens: Row[] = [], hooks: { afterLookup?: (store: Store) => void; beforeInsert?: (store: Store) => void } = {}) {
  let store: Store = { users: users.map((row) => ({ ...row })), tokens: tokens.map((row) => ({ ...row })) };
  const api = (target: () => Store) => ({
    select: (columns: Record<string, string>) => ({ from: (table: any) => ({ where: (predicate: any) => ({ limit: async (count: number) => {
      const rows = target()[table.__table as keyof Store].filter((row) => matches(row, predicate)).slice(0, count).map((row) => project(row, columns));
      hooks.afterLookup?.(target()); hooks.afterLookup = undefined;
      return rows;
    } }) }) }),
    update: (table: any) => ({ set: (patch: Row) => ({ where: (predicate: any) => {
      // Fixtures pass no Google profile, so the optional name/photo sync never runs.
      return { returning: async (columns: Record<string, string>) => {
        const changed: Row[] = []; const current = target();
        current[table.__table as keyof Store] = current[table.__table as keyof Store].map((row) => {
          if (!matches(row, predicate)) return row;
          const next = applyPatch(row, patch); changed.push(next); return next;
        });
        return changed.map((row) => project(row, columns));
      } };
    } }) }),
    delete: (table: any) => ({ where: async (predicate: any) => {
      const current = target();
      current[table.__table as keyof Store] = current[table.__table as keyof Store].filter((row) => !matches(row, predicate));
    } }),
    insert: () => ({ values: (values: Row) => ({ onConflictDoNothing: () => ({ returning: async (columns: Record<string, string>) => {
      hooks.beforeInsert?.(target());
      if (target().users.some((row) => row.email.toLowerCase() === values.email)) return [];
      const created = { id: otherUserId, password: null, sessionVersion: 0, role: "regular", emailVerificationPending: false, ...values };
      target().users.push(created);
      return [project(created, columns)];
    } }) }) }),
  });
  const db = {
    ...api(() => store),
    transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      const draft: Store = { users: store.users.map((row) => ({ ...row })), tokens: [...store.tokens] };
      const result = await work(api(() => draft));
      store = draft;
      return result;
    },
  };
  const exports: Record<string, any> = {};
  const mocks: Record<string, unknown> = {
    "server-only": {}, "bcrypt-ts": { compare: async () => false }, "drizzle-orm": drizzleOrm,
    "drizzle-orm/postgres-js": { drizzle: () => db }, postgres: { default: () => ({}) }, "@/lib/db/schema": schema,
    "@/lib/db/utils": { generateHashedPassword: (value: string) => `hashed:${value}` },
    "@/lib/errors": { ChatSDKError: FakeChatSDKError }, "@/lib/utils": { generateUUID: () => otherUserId },
  };
  vm.runInNewContext(transpile("lib/db/auth-queries.ts"), {
    exports, Date, URL, process: { env: { POSTGRES_URL: "postgres://fixture.invalid/db" } },
    console: { info: () => {}, warn: () => {}, error: () => {} },
    require: (name: string) => {
      if (name.startsWith("node:")) return realRequire(name);
      if (name in mocks) return mocks[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { ensure: exports.ensureAuthOAuthUser, user: () => store.users.find((row) => row.id === userId), tokens: () => store.tokens };
}

const account = (overrides: Row) => ({
  id: userId, email, password: "hashed:attacker-chosen", sessionVersion: 2, role: "regular", authProvider: "credentials",
  isActive: false, emailVerificationPending: true, allowPersonalKnowledge: false, image: null, firstName: null, lastName: null,
  dateOfBirth: null, updatedAt: new Date(0), ...overrides,
});
const tokenRows = [{ id: "token-1", userId, token: "pending-link" }, { id: "token-2", userId: otherUserId, token: "someone-else" }];

test("Google sign-in claims a pending signup for the mailbox owner and drops the unverified password", async () => {
  const h = authQueriesHarness([account({})], tokenRows);
  const result = await h.ensure("Owner@Example.test");
  expect(result).toMatchObject({ isNewUser: false, user: { id: userId, isActive: true, password: null, sessionVersion: 3 } });
  expect(h.user()).toMatchObject({ isActive: true, emailVerificationPending: false, password: null, sessionVersion: 3, authProvider: "google" });
  expect(h.tokens()).toEqual([tokenRows[1]]);
});

test("accounts deactivated by an admin or the user stay rejected and untouched", async () => {
  const deactivated = account({ password: "hashed:owner", emailVerificationPending: false });
  const h = authQueriesHarness([deactivated], tokenRows);
  await expect(h.ensure(email)).rejects.toMatchObject({ code: "forbidden:auth", cause: "account_inactive" });
  expect(h.user()).toEqual(deactivated);
  expect(h.tokens()).toEqual(tokenRows);
});

test("an active verified account signs in unchanged and keeps its password", async () => {
  const active = account({ isActive: true, emailVerificationPending: false, password: "hashed:owner" });
  const h = authQueriesHarness([active]);
  const result = await h.ensure(email);
  expect(result).toMatchObject({ isNewUser: false, user: { id: userId, password: "hashed:owner", sessionVersion: 2 } });
  expect(h.user()).toEqual(active);
});

test("a pending signup that wins the insert race is claimed, and a link verification that wins first is kept", async () => {
  const raced = authQueriesHarness([], [], { beforeInsert: (store) => { store.users.push(account({})); } });
  expect(await raced.ensure(email)).toMatchObject({ isNewUser: false, user: { id: userId, isActive: true, password: null, sessionVersion: 3 } });

  const verified = authQueriesHarness([account({})], [], { afterLookup: (store) => {
    store.users = store.users.map((row) => ({ ...row, isActive: true, emailVerificationPending: false }));
  } });
  expect(await verified.ensure(email)).toMatchObject({ user: { id: userId, isActive: true, sessionVersion: 2 } });
  expect(verified.user()).toMatchObject({ isActive: true, emailVerificationPending: false, sessionVersion: 2 });
});

function nextAuthHarness(failure?: string) {
  let callbacks: any;
  const ensured: string[] = [];
  const exports: Record<string, any> = {};
  const mocks: Record<string, any> = {
    "next-auth": { default: (config: any) => { callbacks = config.callbacks; return { auth: async () => null, handlers: { GET: async () => new Response(), POST: async () => new Response() } }; } },
    "next-auth/providers/credentials": { default: (config: any) => config },
    "next-auth/providers/google": { default: () => ({}) },
    "next/headers": { cookies: async () => ({ get: () => undefined }) },
    "@/lib/referrals/rules": { normalizeReferralCode: () => null, REFERRAL_COOKIE: "referral" },
    "@/lib/errors": { ChatSDKError: FakeChatSDKError },
    "@/lib/utils/async": { withTimeout: (promise: Promise<unknown>) => promise },
    "@/lib/security/guest-login": { isGuestLoginEnabled: () => false },
    "@/lib/db/auth-queries": { ensureAuthOAuthUser: async (value: string) => {
      ensured.push(value);
      if (failure) throw new FakeChatSDKError("forbidden:auth", failure);
      return { isNewUser: false, user: { id: userId, sessionVersion: 3, role: "regular", image: null, updatedAt: new Date(0), dateOfBirth: null, firstName: "Real", lastName: "Owner", allowPersonalKnowledge: false } };
    } },
    "./auth.config": { authConfig: {} },
  };
  vm.runInNewContext(transpile("app/(auth)/auth.ts"), {
    exports, Date, Response, process: { env: { AUTH_SECRET: "disposable-auth-secret" } }, console: { warn: () => {}, error: () => {} },
    require: (name: string) => {
      if (name in mocks) return mocks[name];
      if (name === "bcrypt-ts" || name.startsWith("node:")) return realRequire(name);
      return {};
    },
  });
  const signIn = (profile: unknown) => callbacks.signIn({ user: { email, name: "Real Owner" }, account: { provider: "google" }, profile });
  return { signIn, ensured };
}

test("web Google sign-in requires Google's verified-email claim before any account lookup", async () => {
  for (const profile of [undefined, {}, { email_verified: false }, { email_verified: "true" }]) {
    const h = nextAuthHarness();
    expect(await h.signIn(profile)).toBe(false);
    expect(h.ensured).toEqual([]);
  }
  const verified = nextAuthHarness();
  expect(await verified.signIn({ email_verified: true })).toBe(true);
  expect(verified.ensured).toEqual([email]);
  expect(await nextAuthHarness("account_inactive").signIn({ email_verified: true })).toBe("/login?error=AccountInactive");
});

test("the mobile Google callback shares the claiming account helper", () => {
  const source = readFileSync("app/api/mobile/auth/google-callback/route.ts", "utf8");
  expect(source).toContain('import { ensureAuthOAuthUser } from "@/lib/db/auth-queries"');
  expect(source).toContain("ensureAuthOAuthUser(userInfo.email");
});

function findElements(node: any, type: unknown, found: any[] = []): any[] {
  if (Array.isArray(node)) {
    for (const child of node) findElements(child, type, found);
  } else if (node && typeof node === "object") {
    if (node.type === type) found.push(node);
    findElements(node.props?.children, type, found);
  }
  return found;
}

test("opening a verification link renders a confirm button and never verifies during render", async () => {
  const VerifyEmailConfirm = () => null;
  const exports: Record<string, any> = {};
  vm.runInNewContext(transpile("app/(auth)/verify-email/page.tsx", true), {
    exports, Promise,
    require: (name: string) => {
      if (name === "react/jsx-runtime") return realRequire(name);
      if (name === "next/headers") return { cookies: async () => ({ get: () => undefined }) };
      if (name === "next/link") return { default: "a" };
      if (name === "@/lib/i18n/auth-fallback-bundle") return { getAuthFallbackTranslationBundle: () => ({ dictionary: {} }) };
      if (name === "./verify-email-confirm") return { VerifyEmailConfirm };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const linked = await exports.default({ searchParams: Promise.resolve({ token: "pending-link" }) });
  const [confirm] = findElements(linked, VerifyEmailConfirm);
  expect(confirm.props).toMatchObject({ token: "pending-link", confirm: { button: "Verify email" }, results: { verified: { title: "Email verified" } } });
  const missing = await exports.default({ searchParams: Promise.resolve({}) });
  expect(findElements(missing, VerifyEmailConfirm)).toEqual([]);
  expect(JSON.stringify(missing)).toContain("Invalid verification link");
  const pageSource = readFileSync("app/(auth)/verify-email/page.tsx", "utf8");
  expect(pageSource).not.toContain("verifyUserEmailByToken");
  expect(pageSource).not.toContain("@/lib/db/queries");
});

test("the confirm action verifies only on POST and returns only the status", async () => {
  const verified: string[] = [];
  let fail = false;
  const exports: Record<string, any> = {};
  vm.runInNewContext(transpile("app/(auth)/verify-email/actions.ts"), {
    exports, console: { warn: () => {} },
    require: (name: string) => {
      if (name === "zod") return realRequire(name);
      if (name === "@/lib/utils/async") return { withTimeout: (promise: Promise<unknown>) => promise };
      if (name === "@/lib/db/queries") return { verifyUserEmailByToken: async (token: string) => {
        verified.push(token);
        if (fail) throw new Error("database unavailable");
        return { status: "verified", user: { password: "hashed:secret" } };
      } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const submit = (token: unknown) => {
    const form = new FormData();
    if (typeof token === "string") form.set("token", token);
    return exports.confirmEmailVerificationAction({ status: "idle" }, form);
  };
  expect(await submit("pending-link")).toEqual({ status: "verified" });
  expect(await submit(undefined)).toEqual({ status: "not_found" });
  expect(await submit("x".repeat(129))).toEqual({ status: "not_found" });
  expect(verified).toEqual(["pending-link"]);
  fail = true;
  expect(await submit("pending-link")).toEqual({ status: "failed" });
});
