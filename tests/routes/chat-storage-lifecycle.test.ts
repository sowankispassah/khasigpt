import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import ts from "typescript";
import * as schema from "@/lib/db/schema";
import * as fileKeys from "@/lib/uploads/private-file-key";
import * as lifecycle from "@/lib/uploads/storage-lifecycle";
import { cleanClaimedFiles, selectCleanupFiles } from "@/lib/uploads/storage-lifecycle";

test.skip(process.env.ISOLATED_TEST_RUN !== "1", "Requires a disposable local database.");
let client: ReturnType<typeof postgres>;
let database: ReturnType<typeof drizzle>;
let owner: string;
const chats: string[] = [];
const characters: string[] = [];
let previousIcons: unknown;
let changedIcons = false;
const now = new Date();
const ago = (hours: number) => new Date(now.getTime() - hours * 3600_000);

test.beforeAll(() => {
  const url = new URL(process.env.POSTGRES_URL ?? "http://invalid");
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);
  expect(url.pathname.startsWith("/khasigpt_audit_")).toBe(true);
  client = postgres(url.toString(), { max: 4, prepare: false });
  database = drizzle(client);
});
test.beforeEach(async () => {
  owner = randomUUID();
  await client`INSERT INTO "User" (id,email) VALUES (${owner},${`${owner}@storage.example.test`})`;
});
test.afterEach(async () => {
  if (characters.length) { await client`DELETE FROM "Character" WHERE id IN ${client(characters)}`; characters.length = 0; }
  if (changedIcons) {
    if (previousIcons === undefined) await client`DELETE FROM "AppSetting" WHERE key = 'home.iconPrompts'`;
    else await client`UPDATE "AppSetting" SET value = ${typeof previousIcons === "string" ? previousIcons : JSON.stringify(previousIcons)}::json WHERE key = 'home.iconPrompts'`;
    changedIcons = false;
  }
  if (chats.length) {
    await client`DELETE FROM "Message_v2" WHERE "chatId" IN ${client(chats)}`;
    await client`DELETE FROM "Chat" WHERE id IN ${client(chats)}`;
    chats.length = 0;
  }
  await client`UPDATE "ChatFile" SET state = 'deleted' WHERE "userId" = ${owner}`;
  await client`DELETE FROM "ChatFileReference" WHERE key IN (SELECT key FROM "ChatFile" WHERE "userId" = ${owner})`;
  await client`DELETE FROM "ChatFile" WHERE "userId" = ${owner}`;
  await client`DELETE FROM "ChatStorageAccount" WHERE "userId" = ${owner}`;
  await client`DELETE FROM "User" WHERE id = ${owner}`;
});
test.afterAll(async () => { await client?.end(); });

async function file(age = 25, confirmed = true) {
  const key = `uploads/${owner}/${randomUUID()}.pdf`;
  await client`INSERT INTO "ChatFile" (key,"userId",bytes,"createdAt",state,confirmed,etag) VALUES (${key},${owner},1024,${ago(age).toISOString()},${confirmed ? "ready" : "reserved"},${confirmed},'fixture-etag')`;
  return key;
}
async function chat(deletedHours: number | null = null) {
  const id = randomUUID();
  chats.push(id);
  await client`INSERT INTO "Chat" (id,"userId",title,"createdAt","deletedAt") VALUES (${id},${owner},'Disposable storage fixture',${ago(48).toISOString()},${deletedHours === null ? null : ago(deletedHours).toISOString()})`;
  return id;
}
function part(key: string, historicalToken = false) {
  const payload = Buffer.from(JSON.stringify({ key, url: `https://fixture.private.blob.vercel-storage.com/${key}`, issuedAt: ago(500).getTime(), expiresAt: ago(499).getTime() })).toString("base64url");
  return { type: "file", mediaType: "application/pdf", url: historicalToken ? `https://khasigpt.com/api/files/download?token=${payload}.retentiononly` : `https://fixture.private.blob.vercel-storage.com/${key}` };
}
async function message(chatId: string, key: string, token = false) {
  const id = randomUUID();
  await client`INSERT INTO "Message_v2" (id,"chatId",role,parts,attachments,"createdAt") VALUES (${id},${chatId},'user',${JSON.stringify([part(key, token)])}::json,'[]',${ago(48).toISOString()})`;
  return id;
}
async function eligible() { return (await selectCleanupFiles(database, { dryRun: true, now })).map(item => item.key); }

test("unused uploads get 24 hours, and dry runs never claim them", async () => {
  const recent = await file(23);
  const old = await file(25);
  const keys = await eligible();
  expect(keys).toContain(old);
  expect(keys).not.toContain(recent);
  expect((await client`SELECT state FROM "ChatFile" WHERE key = ${old}`)[0].state).toBe("ready");
});

test("historical signed URLs in active chats protect the actual file", async () => {
  const key = await file(1000);
  await message(await chat(), key, true);
  expect(await eligible()).not.toContain(key);
  expect((await client`SELECT count(*)::int AS count FROM "ChatFileReference" WHERE key = ${key}`)[0].count).toBe(1);
});

test("reuse in another active chat wins over an old deleted chat", async () => {
  const key = await file(1000);
  const deleted = await chat(8 * 24);
  const active = await chat();
  await message(deleted, key);
  await message(active, key);
  expect(await eligible()).not.toContain(key);
  await client`UPDATE "Chat" SET "deletedAt" = ${ago(6 * 24).toISOString()} WHERE id = ${active}`;
  expect(await eligible()).not.toContain(key);
  await client`UPDATE "Chat" SET "deletedAt" = ${ago(8 * 24).toISOString()} WHERE id = ${active}`;
  expect(await eligible()).toContain(key);
});

test("the due-date queue preserves a full seven-day UTC grace period", async () => {
  const key = await file(1000);
  const deletedHours = 7 * 24 - 1;
  await message(await chat(deletedHours), key);
  expect(await eligible()).not.toContain(key);
  const rows = await client`SELECT extract(epoch FROM ("cleanupAfter" - (${ago(deletedHours).toISOString()}::timestamptz + interval '7 days')))::integer AS delta FROM "ChatFile" WHERE key = ${key}`;
  expect(rows[0].delta).toBe(0);
  expect((await client`SELECT indexname FROM pg_indexes WHERE indexname IN ('ChatFile_due_idx','ChatFile_retry_idx')`).length).toBe(2);
});

test("removed message references retain previously attached files for seven days", async () => {
  const key = await file(1000);
  const id = await message(await chat(), key);
  await client`UPDATE "Message_v2" SET parts = '[]' WHERE id = ${id}`;
  expect(await eligible()).not.toContain(key);
  await client`UPDATE "ChatFile" SET "unreferencedAt" = ${ago(8 * 24).toISOString()} WHERE key = ${key}`;
  expect(await eligible()).toContain(key);
});

test("duplicate message saves do not index unpersisted replacement parts", async () => {
  const original = await file();
  const replacement = await file();
  const id = await message(await chat(), original);
  const existing = (await client`SELECT * FROM "Message_v2" WHERE id = ${id}`)[0];
  await client`INSERT INTO "Message_v2" (id,"chatId",role,parts,attachments,"createdAt") VALUES (${id},${existing.chatId},'user',${JSON.stringify([part(replacement)])}::json,'[]',${ago(48).toISOString()}) ON CONFLICT DO NOTHING`;
  expect((await client`SELECT key FROM "ChatFileReference" WHERE "messageId" = ${id}`).map(row => row.key)).toEqual([original]);
});

test("malformed private references roll the message write back", async () => {
  const id = randomUUID();
  const chatId = await chat();
  await expect(client`INSERT INTO "Message_v2" (id,"chatId",role,parts,attachments,"createdAt") VALUES (${id},${chatId},'user',${JSON.stringify([{ type: "file", url: "https://khasigpt.com/api/files/download?token=invalid.signature" }])}::json,'[]',now())`).rejects.toThrow();
  expect((await client`SELECT id FROM "Message_v2" WHERE id = ${id}`).length).toBe(0);
});

test("a cleanup claim prevents a late attachment or deleted-chat restore", async () => {
  const key = await file(1000);
  const oldChat = await chat(8 * 24);
  await message(oldChat, key);
  const claimed = await selectCleanupFiles(database, { now });
  expect(claimed.map(item => item.key)).toContain(key);
  await expect(message(await chat(), key)).rejects.toThrow("expired");
  await expect(client`UPDATE "Chat" SET "deletedAt" = NULL WHERE id = ${oldChat}`).rejects.toThrow("expired");
  expect((await client`SELECT state FROM "ChatFile" WHERE key = ${key}`)[0].state).toBe("deleting");
});

test("a pending message transaction is skipped by concurrent cleanup", async () => {
  const key = await file(1000);
  const chatId = await chat();
  let signalReady!: () => void;
  let release!: () => void;
  const ready = new Promise<void>(resolve => { signalReady = resolve; });
  const finish = new Promise<void>(resolve => { release = resolve; });
  const write = client.begin(async tx => {
    await tx`INSERT INTO "Message_v2" (id,"chatId",role,parts,attachments,"createdAt") VALUES (${randomUUID()},${chatId},'user',${JSON.stringify([part(key)])}::json,'[]',now())`;
    signalReady();
    await finish;
  });
  await ready;
  try { expect((await selectCleanupFiles(database, { now })).map(item => item.key)).not.toContain(key); }
  finally { release(); await write; }
  expect(await eligible()).not.toContain(key);
});

test("failed deletes keep accounting and are retryable, including unconfirmed uploads", async () => {
  const key = await file(1000, false);
  const claimed = (await selectCleanupFiles(database, { now })).filter(item => item.key === key);
  expect(claimed).toHaveLength(1);
  const failed = await cleanClaimedFiles(claimed, {
    deadline: Date.now() + 1000,
    remove: async () => { throw new Error("Disposable storage unavailable"); },
    complete: async () => { throw new Error("must not complete"); },
    fail: async target => { await client`UPDATE "ChatFile" SET failures = failures + 1, "retryAt" = ${ago(1).toISOString()} WHERE key = ${target}`; },
  });
  expect(failed.failed).toBe(1);
  expect(await eligible()).toContain(key);
  expect((await client`SELECT state,failures FROM "ChatFile" WHERE key = ${key}`)[0]).toMatchObject({ state: "deleting", failures: 1 });
});

test("confirmed deletion updates account totals exactly once", async () => {
  const key = await file(1000);
  expect((await client`SELECT bytes::int,files FROM "ChatStorageAccount" WHERE "userId" = ${owner}`)[0]).toMatchObject({ bytes: 1024, files: 1 });
  const claimed = (await selectCleanupFiles(database, { now })).filter(item => item.key === key);
  const complete = async (target: string) => { await client`UPDATE "ChatFile" SET state = 'deleted', "deletedAt" = now() WHERE key = ${target}`; };
  const result = await cleanClaimedFiles(claimed, { deadline: Date.now() + 1000, remove: async () => {}, complete, fail: async () => {} });
  expect(result.deleted).toBe(1);
  await complete(key);
  expect((await client`SELECT bytes::int,files FROM "ChatStorageAccount" WHERE "userId" = ${owner}`)[0]).toMatchObject({ bytes: 0, files: 0 });
  expect(await eligible()).not.toContain(key);
});

test("unprocessed claims are deferred rather than reported as deleted", async () => {
  const result = await cleanClaimedFiles([{ key: await file(1000), etag: "fixture" }], { deadline: Date.now() - 1, remove: async () => { throw new Error("Must not run"); }, complete: async () => {}, fail: async () => {} });
  expect(result).toEqual({ deleted: 0, failed: 0, deferred: 1 });
});

test("storage metadata tables have RLS enabled", async () => {
  const rows = await client`SELECT relname,relrowsecurity FROM pg_class WHERE relname IN ('ChatFile','ChatFileReference','ChatStorageAccount','ChatStorageMaintenance')`;
  expect(rows).toHaveLength(4);
  expect(rows.every(row => row.relrowsecurity)).toBe(true);
});

function maintenanceModule(blob: Record<string, unknown>) {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  const cache = new Map<string, Record<string, any>>();
  const load = (name: string) => {
    if (name === "server-only") return {};
    if (name === "@vercel/blob") return blob;
    if (name === "@/lib/db/schema") return schema;
    if (name === "@/lib/uploads/private-file-key") return fileKeys;
    if (name === "@/lib/uploads/storage-lifecycle") return lifecycle;
    if (name === "@/lib/uploads/private-documents") return { privateStorageOptions: () => ({ token: "disposable-local-fixture" }) };
    if (name === "@/lib/db/admin-database") return { withAdminDatabase: (_: string, work: any) => work(database, client) };
    if (!name.startsWith("@/lib/uploads/storage-")) return require(name);
    const existing = cache.get(name);
    if (existing) return existing;
    const exports: Record<string, any> = {};
    cache.set(name, exports);
    vm.runInNewContext(ts.transpileModule(readFileSync(`${name.replace("@/", "")}.ts`, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, { exports, require: load, Date, AbortSignal, Buffer, process, console });
    return exports;
  };
  return { ...load("@/lib/uploads/storage-maintenance"), records: load("@/lib/uploads/storage-records") };
}

async function resetMaintenance() {
  await client`UPDATE "ChatStorageMaintenance" SET "leaseId" = NULL, "leaseUntil" = NULL, prefix = 0, cursor = NULL, "inventoryCompletedAt" = NULL`;
}

test("the real storage adapter uses ETags and refuses changed objects", async () => {
  await resetMaintenance();
  const key = await file(1000);
  let deletes = 0;
  const module = maintenanceModule({
    BlobNotFoundError: class extends Error {},
    list: async () => ({ blobs: [{ pathname: key, size: 1024, uploadedAt: ago(1000), etag: "fixture-etag" }], hasMore: false }),
    head: async () => ({ pathname: key, etag: "changed-after-inventory", url: `https://fixture.private.blob.vercel-storage.com/${key}` }),
    del: async () => { deletes++; },
  });
  const result = await module.runChatStorageMaintenance();
  expect(result.ok).toBe(false);
  expect(result.failed).toBe(1);
  expect(deletes).toBe(0);
  expect((await client`SELECT bytes::int FROM "ChatStorageAccount" WHERE "userId" = ${owner}`)[0].bytes).toBe(1024);
});

test("actual maintenance completes conditional deletion and retains an active file", async () => {
  await resetMaintenance();
  const orphan = await file(1000);
  const active = await file(1000);
  await message(await chat(), active);
  const deleted: string[] = [];
  const module = maintenanceModule({
    BlobNotFoundError: class extends Error {},
    list: async () => ({ blobs: [orphan, active].map(key => ({ pathname: key, size: 1024, uploadedAt: ago(1000), etag: "fixture-etag" })), hasMore: false }),
    head: async (key: string) => ({ pathname: key, etag: "fixture-etag", url: `https://fixture.private.blob.vercel-storage.com/${key}` }),
    del: async (url: string, options: { ifMatch: string }) => { expect(options.ifMatch).toBe("fixture-etag"); deleted.push(url); },
  });
  const result = await module.runChatStorageMaintenance();
  expect(result.ok).toBe(true);
  expect(result.deleted).toBe(1);
  expect(deleted).toEqual([`https://fixture.private.blob.vercel-storage.com/${orphan}`]);
  expect((await client`SELECT bytes::int, files FROM "ChatStorageAccount" WHERE "userId" = ${owner}`)[0]).toMatchObject({ bytes: 1024, files: 1 });
});

test("actual maintenance dry run never calls the destructive adapter", async () => {
  await resetMaintenance();
  const key = await file(1000);
  const module = maintenanceModule({
    BlobNotFoundError: class extends Error {},
    list: async () => ({ blobs: [{ pathname: key, size: 1024, uploadedAt: ago(1000), etag: "fixture-etag" }], hasMore: false }),
    head: async () => { throw new Error("Dry run must not read deletion metadata"); },
    del: async () => { throw new Error("Dry run must not delete"); },
  });
  const result = await module.runChatStorageMaintenance({ dryRun: true });
  expect(result.eligible).toBe(1);
  expect(result.deleted).toBe(0);
  expect(result.ok).toBe(true);
  expect((await client`SELECT state FROM "ChatFile" WHERE key = ${key}`)[0].state).toBe("ready");
});

test("an inventory failure persists an unsuccessful result and deletes nothing", async () => {
  await resetMaintenance();
  const key = await file(1000);
  const module = maintenanceModule({
    BlobNotFoundError: class extends Error {},
    list: async () => { throw new Error("Disposable inventory unavailable"); },
    head: async () => { throw new Error("Must not run"); },
    del: async () => { throw new Error("Must not run"); },
  });
  await expect(module.runChatStorageMaintenance()).rejects.toThrow("inventory unavailable");
  const row = (await client`SELECT "lastResult", "leaseId" FROM "ChatStorageMaintenance" WHERE id = 1`)[0];
  const lastResult = typeof row.lastResult === "string" ? JSON.parse(row.lastResult) : row.lastResult;
  expect(lastResult.ok).toBe(false);
  expect(row.leaseId).toBeNull();
  expect((await client`SELECT state FROM "ChatFile" WHERE key = ${key}`)[0].state).toBe("ready");
});

test("upload confirmation accepts a matching inventory observation exactly once", async () => {
  const key = await file();
  const module = maintenanceModule({});
  await module.records.confirmChatFile(key, "fixture-etag");
  await module.records.confirmChatFile(key, "fixture-etag");
  await expect(module.records.confirmChatFile(key, "wrong-etag")).rejects.toThrow();
  expect((await client`SELECT bytes::int,files FROM "ChatStorageAccount" WHERE "userId" = ${owner}`)[0]).toMatchObject({ bytes: 1024, files: 1 });
});

test("configured character images survive cleanup outside any active chat", async () => {
  const key = await file(1000);
  await message(await chat(8 * 24), key);
  const id = randomUUID();
  characters.push(id);
  await client`INSERT INTO "Character" (id,"canonicalName","refImages") VALUES (${id},${`Storage fixture ${id}`},${JSON.stringify([{ url: part(key, true).url, type: "front" }])}::jsonb)`;
  expect(await eligible()).not.toContain(key);
  expect((await client`SELECT "cleanupAfter" FROM "ChatFile" WHERE key = ${key}`)[0].cleanupAfter).toBeNull();
  await client`DELETE FROM "Character" WHERE id = ${id}`;
  characters.length = 0;
  // Removing a shared hold gives a fresh grace period even with an old deleted
  // chat still referring to the same object.
  expect(await eligible()).not.toContain(key);
});

test("prompt iconUrl values receive holds and cleanup cannot take them", async () => {
  const key = await file(1000);
  previousIcons = (await client`SELECT value FROM "AppSetting" WHERE key = 'home.iconPrompts'`)[0]?.value;
  changedIcons = true;
  await client`INSERT INTO "AppSetting" (key,value) VALUES ('home.iconPrompts',${JSON.stringify([{ id: "fixture", iconUrl: part(key, true).url }])}::json) ON CONFLICT (key) DO UPDATE SET value = excluded.value`;
  expect(await eligible()).not.toContain(key);
  expect((await client`SELECT count(*)::int AS count FROM "ChatFileHold" WHERE key = ${key}`)[0].count).toBe(1);
});

test("a shared configuration cannot acquire a file already claimed for deletion", async () => {
  const key = await file(1000);
  await selectCleanupFiles(database, { now });
  const id = randomUUID();
  await expect(client`INSERT INTO "Character" (id,"canonicalName","refImages") VALUES (${id},${`Expired storage fixture ${id}`},${JSON.stringify([{ url: part(key).url }])}::jsonb)`).rejects.toThrow("expired");
  expect((await client`SELECT id FROM "Character" WHERE id = ${id}`).length).toBe(0);
});
