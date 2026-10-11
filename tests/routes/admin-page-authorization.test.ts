import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

// An RSC request can name an already-mounted admin layout in its router state,
// so Next renders only the segment below it. Each segment that can start a
// render must therefore confirm the current administrator itself.
const ADMIN_ROOT = "app/(admin)";
const SEGMENT_FILES = ["page.tsx", "layout.tsx", "template.tsx", "default.tsx"];
const GUARD = "requireAdminPageSession";
const GUARD_MODULE = "@/lib/security/admin-session";
// Impersonation is reviewed separately and keeps its own checks.
const ROUTES_REVIEWED_SEPARATELY = ["app/(admin)/admin/users/[id]/impersonate/route.ts"];
const actorId = "11111111-1111-4111-8111-111111111111";

function adminFiles(names: string[]) {
  return readdirSync(ADMIN_ROOT, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && names.includes(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name).replaceAll("\\", "/"))
    .sort();
}

function parse(file: string) {
  return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function transpile(file: string) {
  return ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}

function hasModifier(node: ts.Node, keyword: ts.SyntaxKind) {
  return ts.canHaveModifiers(node) && Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === keyword));
}

function namedFunction(source: ts.SourceFile, name: string): ts.FunctionLikeDeclaration | undefined {
  for (const node of source.statements) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node;
    if (!ts.isVariableStatement(node)) continue;
    for (const declaration of node.declarationList.declarations) {
      const init = declaration.initializer;
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) return init;
    }
  }
}

function defaultExport(source: ts.SourceFile) {
  for (const node of source.statements) {
    if (ts.isFunctionDeclaration(node) && hasModifier(node, ts.SyntaxKind.DefaultKeyword)) return node;
    if (ts.isExportAssignment(node) && !node.isExportEquals && ts.isIdentifier(node.expression)) return namedFunction(source, node.expression.text);
  }
}

function exportedFunctions(source: ts.SourceFile, names: string[]) {
  return names.flatMap((name) => {
    const fn = namedFunction(source, name);
    const exported = source.statements.some((node) => hasModifier(node, ts.SyntaxKind.ExportKeyword) && (ts.isFunctionDeclaration(node) ? node.name?.text === name : ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name)));
    return fn && exported ? [[name, fn] as const] : [];
  });
}

// The first statement must be `await guard(...)` or `const x = await guard(...)`.
function startsWithAwaitedCall(fn: ts.FunctionLikeDeclaration, callee: string) {
  const isGuard = (node: ts.Node | undefined) => Boolean(node && ts.isAwaitExpression(node) && ts.isCallExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === callee);
  const first = fn.body && ts.isBlock(fn.body) ? fn.body.statements[0] : undefined;
  if (!first) return false;
  if (ts.isExpressionStatement(first)) return isGuard(first.expression);
  if (!ts.isVariableStatement(first)) return false;
  const [declaration, ...rest] = first.declarationList.declarations;
  return rest.length === 0 && isGuard(declaration.initializer);
}

function importsFrom(source: ts.SourceFile, name: string, module: string) {
  return source.statements.some((node) => ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === module && Boolean(node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings) && node.importClause.namedBindings.elements.some((element) => element.name.text === name && !element.propertyName && !element.isTypeOnly)));
}

test("every admin page and layout confirms the administrator before any other work", () => {
  const files = adminFiles(SEGMENT_FILES);
  expect(files.filter((file) => file.endsWith("/page.tsx")).length).toBeGreaterThanOrEqual(20);
  expect(files).toContain("app/(admin)/admin/layout.tsx");
  expect(files).toContain("app/(admin)/admin/users/[id]/logs/page.tsx");
  for (const file of files) {
    const source = parse(file);
    const component = defaultExport(source);
    expect(component, `${file} default export`).toBeTruthy();
    expect(hasModifier(component as ts.Node, ts.SyntaxKind.AsyncKeyword), `${file} default export is async`).toBe(true);
    expect(startsWithAwaitedCall(component as ts.FunctionLikeDeclaration, GUARD), `${file} must start with await ${GUARD}()`).toBe(true);
    expect(importsFrom(source, GUARD, GUARD_MODULE), `${file} imports ${GUARD} from ${GUARD_MODULE}`).toBe(true);
    for (const [name, fn] of exportedFunctions(source, ["generateMetadata", "generateViewport"])) {
      expect(startsWithAwaitedCall(fn, GUARD), `${file} ${name} must start with await ${GUARD}()`).toBe(true);
    }
  }
});

test("admin route handlers confirm the current administrator in the database first", () => {
  const routes = adminFiles(["route.ts", "route.tsx"]).filter((file) => !ROUTES_REVIEWED_SEPARATELY.includes(file));
  expect(routes).toContain("app/(admin)/admin/chats/data/route.ts");
  for (const file of routes) {
    const source = parse(file);
    const handlers = exportedFunctions(source, ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
    expect(handlers.length, file).toBeGreaterThan(0);
    for (const [method, fn] of handlers) {
      expect(startsWithAwaitedCall(fn, "requireAdminApiUser"), `${file} ${method}`).toBe(true);
    }
    expect(importsFrom(source, "requireAdminApiUser", "@/lib/security/admin-api-auth"), file).toBe(true);
  }
});

function sessionHarness() {
  let session: any = { user: { id: actorId, role: "admin", sessionVersion: 0 } };
  let current: any = { id: actorId, role: "admin", isActive: true, sessionVersion: 0 };
  let sessionFails = false;
  let lookupFails = false;
  const calls = { auth: 0, lookup: 0 };
  // Like React's per-request cache(): one result per wrapped function.
  const memo = new Map<unknown, unknown>();
  const mocks: Record<string, unknown> = {
    "server-only": {},
    react: { cache: (fn: () => unknown) => () => {
      if (!memo.has(fn)) memo.set(fn, fn());
      return memo.get(fn);
    } },
    "next/navigation": { redirect: (url: string) => { throw new Error(`redirect:${url}`); } },
    "@/app/(auth)/auth": { auth: async () => {
      calls.auth++;
      if (sessionFails) throw new Error("session unavailable");
      return session;
    } },
    "@/lib/db/auth-queries": { getAuthUserRoleById: async (id: string) => {
      expect(id).toBe(actorId);
      calls.lookup++;
      if (lookupFails) throw new Error("database unavailable");
      return current;
    } },
  };
  const modules = new Map<string, Record<string, any>>();
  function load(file: string): Record<string, any> {
    const cached = modules.get(file);
    if (cached) return cached;
    const exports: Record<string, any> = {};
    modules.set(file, exports);
    vm.runInNewContext(transpile(file), {
      exports, setTimeout, clearTimeout, console: { warn() {}, error() {} },
      require: (name: string) => {
        if (name in mocks) return mocks[name];
        if (name === "@/lib/security/session-version" || name === "@/lib/utils/async") return load(`${name.slice(2)}.ts`);
        throw new Error(`Unexpected import ${name}`);
      },
    }, { filename: file });
    return exports;
  }
  const helper = load("lib/security/admin-session.ts")[GUARD] as () => Promise<unknown>;
  return { helper, calls, session: () => session,
    anonymous: () => { session = null; }, regular: () => { session.user.role = "regular"; },
    missingId: () => { delete session.user.id; }, revoked: () => { current.role = "regular"; },
    inactive: () => { current.isActive = false; }, missing: () => { current = null; },
    passwordChanged: () => { current.sessionVersion++; },
    failSession: () => { sessionFails = true; }, failLookup: () => { lookupFails = true; },
  };
}

test("the page guard redirects anyone who is not a current active administrator", async () => {
  const scenarios = ["anonymous", "regular", "missingId", "revoked", "inactive", "missing", "passwordChanged", "failSession", "failLookup"] as const;
  for (const scenario of scenarios) {
    const h = sessionHarness();
    h[scenario]();
    await expect(h.helper(), scenario).rejects.toThrow(/^redirect:\/$/);
    if (["anonymous", "regular", "missingId", "failSession"].includes(scenario)) expect(h.calls.lookup, scenario).toBe(0);
  }
});

test("the page guard returns the confirmed session once per render request", async () => {
  const h = sessionHarness();
  expect(await h.helper()).toBe(h.session());
  // The layout and page share one confirmation within a request.
  expect(await h.helper()).toBe(h.session());
  expect(h.calls).toEqual({ auth: 1, lookup: 1 });
});

function chatsDataRoute(admin: object | null) {
  const calls = { auth: [] as unknown[], reads: [] as string[] };
  const exports: Record<string, any> = {};
  const mocks: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } },
    "@/lib/api/cache": { noStoreHeaders: () => ({ "Cache-Control": "no-store" }) },
    "@/lib/db/queries": {
      listChats: async () => { calls.reads.push("listChats"); return []; },
      getChatCount: async () => { calls.reads.push("getChatCount"); return 0; },
    },
    "@/lib/security/admin-api-auth": { requireAdminApiUser: async (request: unknown) => { calls.auth.push(request); return admin; } },
    "@/lib/utils/async": { withTimeout: (promise: Promise<unknown>) => promise },
  };
  vm.runInNewContext(transpile("app/(admin)/admin/chats/data/route.ts"), {
    exports, URL, console: { error() {} },
    require: (name: string) => {
      if (name in mocks) return mocks[name];
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return { route: exports, calls };
}

test("the admin chat table endpoint rejects non-administrators before reading chats", async () => {
  const request = new Request("https://example.test/admin/chats/data?deleted=1");
  const denied = chatsDataRoute(null);
  expect((await denied.route.GET(request)).status).toBe(401);
  expect(denied.calls.auth).toEqual([request]);
  expect(denied.calls.reads).toEqual([]);

  const allowed = chatsDataRoute({ id: actorId, role: "admin" });
  const response = await allowed.route.GET(request);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ items: [], total: 0 });
  expect(allowed.calls.reads.sort()).toEqual(["getChatCount", "listChats"]);
});
