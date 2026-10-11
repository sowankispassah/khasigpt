import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

// Exercise the real loader without opening connections to the shared database.
async function loadFunction(file: string, name: string, dependencies: Record<string, unknown>) {
  const source = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!declaration) throw new Error(`Loader ${name} was not found.`);
  const compiled = ts.transpileModule(`${declaration.getText(source)}\nexports.loader = ${name};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ESNext },
  }).outputText;
  const context = vm.createContext({ exports: {}, console: { error() {} }, ...dependencies });
  vm.runInContext(compiled, context);
  return context.exports.loader;
}

async function snapshotLoader(read: (keys: string[]) => Promise<{ key: string; value: unknown }[]>) {
  return loadFunction("app/(admin)/admin/settings/page.tsx", "loadAppSettingValuesByKey", {
    getAdminAppSettingsByKeys: read,
    ESSENTIAL_FALLBACK_SETTING_KEYS: ["essential"],
    SETTINGS_SNAPSHOT_KEYS: ["essential", "optional"],
    NON_ESSENTIAL_SETTINGS_SNAPSHOT_KEYS: ["optional"],
    ADMIN_SETTINGS_SNAPSHOT_QUERY_TIMEOUT_MS: 10_000,
    withTimeout: (promise: Promise<unknown>) => promise,
    getLastKnownAppSettingsByKeys: () => new Map([["optional", "last confirmed"]]),
  });
}

test("a successful settings snapshot does not start a redundant backup query", async () => {
  const reads: string[][] = [];
  const load = await snapshotLoader(async keys => {
    reads.push([...keys]);
    return [{ key: "essential", value: true }, { key: "optional", value: "confirmed" }];
  });
  const result = await load();
  expect(reads).toEqual([["essential", "optional"]]);
  expect(result.source).toBe("snapshot-db");
  expect(result.values.get("optional")).toBe("confirmed");
});

test("only a failed snapshot starts the essential read and preserves confirmed optional values", async () => {
  const reads: string[][] = [];
  let rejectSnapshot!: (error: Error) => void;
  const blocked = new Promise<{ key: string; value: unknown }[]>((_resolve, reject) => { rejectSnapshot = reject; });
  const load = await snapshotLoader(async keys => {
    reads.push([...keys]);
    return keys.includes("optional") ? blocked : [{ key: "essential", value: true }];
  });
  const pending = load();
  expect(reads).toEqual([["essential", "optional"]]);
  rejectSnapshot(new Error("Connection unavailable"));
  const result = await pending;
  expect(reads).toEqual([["essential", "optional"], ["essential"]]);
  expect(result.source).toBe("essential-db");
  expect(result.values.get("essential")).toBe(true);
  expect(result.values.get("optional")).toBe("last confirmed");
});

test("failed settings recovery remains last-known instead of fabricating a confirmed empty snapshot", async () => {
  const load = await snapshotLoader(async () => { throw new Error("Connection unavailable"); });
  const result = await load();
  expect(result.source).toBe("last-known");
  expect(result.values.get("optional")).toBe("last confirmed");
});

test("admin settings use the isolated database even when the shared pool is blocked", async () => {
  const rows = [{ key: "essential", value: true, updatedAt: new Date() }];
  const remembered: unknown[] = [];
  let selectedKeys: string[] = [];
  const load = await loadFunction("lib/db/queries.ts", "getAdminAppSettingsByKeys", {
    db: { select: () => { throw new Error("Shared pool is blocked"); } },
    isProductionBuildPhase: () => false,
    shouldUseAppSettingCache: () => false,
    appSetting: { key: "key" },
    inArray: (_column: unknown, keys: string[]) => { selectedKeys = [...keys]; },
    withAdminDatabase: (_label: string, query: (db: unknown) => Promise<unknown>) => query({
      select: () => ({ from: () => ({ where: async () => rows }) }),
    }),
    rememberAppSettings: (values: unknown) => remembered.push(values),
    clearRememberedAppSetting: () => {},
  });
  expect(await load([" essential ", "essential", ""])).toEqual(rows);
  expect(selectedKeys).toEqual(["essential"]);
  expect(remembered).toEqual([rows]);
});

test("a failed admin read rejects without remembering fallback success", async () => {
  const remembered: unknown[] = [];
  const load = await loadFunction("lib/db/queries.ts", "getAdminAppSettingsByKeys", {
    isProductionBuildPhase: () => false,
    shouldUseAppSettingCache: () => false,
    withAdminDatabase: async () => { throw new Error("Admin connection unavailable"); },
    rememberAppSettings: (values: unknown) => remembered.push(values),
  });
  await expect(load(["essential"])).rejects.toThrow("Admin connection unavailable");
  expect(remembered).toEqual([]);
});

for (const [name, expectedLabel] of [
  ["listAdminSettingsModelConfigs", "settings.models"],
  ["listAdminLanguagesWithSettings", "settings.languages"],
  ["listAdminTranslationFeatureLanguages", "settings.translation-languages"],
] as const) {
  test(`${name} remains independent of a blocked shared pool`, async () => {
    const rows = [{ id: "confirmed" }];
    const labels: string[] = [];
    let limit: number | undefined;
    const adminDb = {
      select: () => ({ from: () => ({ orderBy: () => Object.assign(Promise.resolve(rows), {
        limit: (value: number) => { limit = value; return Promise.resolve(rows); },
      }) }) }),
    };
    const load = await loadFunction("lib/db/queries.ts", name, {
      db: { select: () => { throw new Error("Shared queue expired"); } },
      modelConfig: { createdAt: "createdAt" },
      language: { name: "name" },
      asc: (column: unknown) => column,
      desc: (column: unknown) => column,
      listTranslationFeatureLanguages: (database: unknown) => {
        expect(database).toBe(adminDb);
        return rows;
      },
      withAdminDatabase: (label: string, query: (database: unknown) => Promise<unknown>) => {
        labels.push(label);
        return query(adminDb);
      },
    });
    expect(await load()).toEqual(rows);
    expect(labels).toEqual([expectedLabel]);
    if (name === "listAdminSettingsModelConfigs") expect(limit).toBe(200);
  });
}

test("translation language compatibility fallback also uses the supplied admin database", async () => {
  const rows = [{ id: "confirmed", speechModelConfigId: null }];
  const missingColumn = new Error("Missing legacy column");
  let selections = 0;
  const database = {
    select: (columns?: unknown) => {
      selections += 1;
      return { from: () => ({ orderBy: async () => {
        if (!columns) throw missingColumn;
        return rows;
      } }) };
    },
  };
  const load = await loadFunction("lib/db/queries.ts", "listTranslationFeatureLanguages", {
    db: { select: () => { throw new Error("Shared queue expired"); } },
    translationFeatureLanguage: {},
    asc: (column: unknown) => column,
    desc: (column: unknown) => column,
    isMissingTranslationSpeechModelColumnError: (error: unknown) => error === missingColumn,
    sql: () => ({ as: () => "null" }),
  });
  expect(await load(database)).toEqual(rows);
  expect(selections).toBe(2);
});
