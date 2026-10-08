import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import { PgDialect } from "drizzle-orm/pg-core";
import ts from "typescript";

const requireModule = createRequire(path.join(process.cwd(), "package.json"));
const compile = (file: string) =>
  ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

function load(file: string, mocks: Record<string, unknown> = {}) {
  const exports: Record<string, any> = {};
  vm.runInNewContext(compile(file), {
    exports,
    AbortSignal,
    console: { warn() {}, error() {} },
    require: (name: string) =>
      name in mocks ? mocks[name] : requireModule(name),
  });
  return exports;
}

const ACCOUNT = "3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b";

function fakeBlobStore(pathnames: string[], pageSize = 2) {
  const listed: Array<{ prefix: string; cursor?: string }> = [];
  const deleted: string[] = [];
  return {
    listed,
    deleted,
    module: {
      list: async ({ prefix, cursor }: { prefix: string; cursor?: string }) => {
        listed.push({ prefix, cursor });
        const matching = pathnames.filter((name) => name.startsWith(prefix));
        const start = cursor ? Number(cursor) : 0;
        const page = matching.slice(start, start + pageSize);
        const next = start + pageSize;
        return {
          blobs: page.map((name) => ({ pathname: name, url: `https://store.public.blob.vercel-storage.com/${name}` })),
          hasMore: next < matching.length,
          cursor: next < matching.length ? String(next) : undefined,
        };
      },
      del: async (urls: string[]) => {
        deleted.push(...urls);
      },
    },
  };
}

test("deletes every profile photo under the account's avatar prefix", async () => {
  const store = fakeBlobStore([
    `avatars/${ACCOUNT}/a.png`,
    `avatars/${ACCOUNT}/b.jpg`,
    `avatars/${ACCOUNT}/c.webp`,
    "avatars/other-account/d.png",
    `uploads/${ACCOUNT}/file.pdf`,
  ]);
  const { deleteAccountAvatarBlobs } = load("lib/uploads/account-avatar-cleanup.ts", {
    "server-only": {},
    "@vercel/blob": store.module,
  });

  expect(await deleteAccountAvatarBlobs(ACCOUNT)).toBe(3);
  expect(store.listed.every((call) => call.prefix === `avatars/${ACCOUNT}/`)).toBe(true);
  // Two pages were needed, and nothing outside the account's avatars was touched.
  expect(store.listed).toHaveLength(2);
  expect(store.deleted).toEqual([
    `https://store.public.blob.vercel-storage.com/avatars/${ACCOUNT}/a.png`,
    `https://store.public.blob.vercel-storage.com/avatars/${ACCOUNT}/b.jpg`,
    `https://store.public.blob.vercel-storage.com/avatars/${ACCOUNT}/c.webp`,
  ]);
});

test("refuses an account id that could widen the avatar prefix", async () => {
  const store = fakeBlobStore([`avatars/${ACCOUNT}/a.png`]);
  const { deleteAccountAvatarBlobs } = load("lib/uploads/account-avatar-cleanup.ts", {
    "server-only": {},
    "@vercel/blob": store.module,
  });
  for (const bad of ["", "*", "../avatars", `${ACCOUNT}/..`, "not-a-uuid"]) {
    await expect(deleteAccountAvatarBlobs(bad)).rejects.toThrow("Invalid account id.");
  }
  expect(store.listed).toHaveLength(0);
  expect(store.deleted).toHaveLength(0);
});

test("claims only the account's unshared, unused files for the next cleanup", async () => {
  const lifecycle = load("lib/uploads/storage-lifecycle.ts");
  let captured: unknown = null;
  await lifecycle.claimAccountFilesForCleanup(
    { execute: async (query: unknown) => { captured = query; return []; } },
    ACCOUNT
  );
  const { sql: text, params } = new PgDialect().sqlToQuery(captured as never);
  const normalized = text.replace(/\s+/g, " ");

  expect(params).toEqual([ACCOUNT]);
  expect(normalized).toContain(`UPDATE "ChatFile" f SET "state" = 'deleting', "retryAt" = now()`);
  expect(normalized).toContain(`f."userId" = $1::uuid AND f."state" IN ('reserved','ready')`);
  // Shared configuration images (holds) and files in another live chat stay.
  expect(normalized).toContain(`NOT EXISTS (SELECT 1 FROM "ChatFileHold" h WHERE h."key" = f."key")`);
  expect(normalized).toContain(`c."deletedAt" IS NULL`);
});

test("account deletion claims files after removing chats, and the admin action removes photos", () => {
  const queries = readFileSync("lib/db/queries.ts", "utf8");
  const start = queries.indexOf("async function deleteAccountDataForRequest");
  const body = queries.slice(start, queries.indexOf("\n}\n", start));
  expect(body.indexOf("await claimAccountFilesForCleanup(tx, userId)")).toBeGreaterThan(
    body.indexOf("await tx.delete(chat).where(inArray(chat.id, chatIds))")
  );

  const action = readFileSync("app/(admin)/admin/account-deletion/actions.ts", "utf8");
  expect(action).toContain('updated.status === "completed" && updated.userId');
  expect(action).toContain("deleteAccountAvatarBlobs(updated.userId)");
});

test("permanent admin deletion also releases the user's files and photos", () => {
  const queries = readFileSync("lib/db/queries.ts", "utf8");
  const start = queries.indexOf("async function deleteUserPermanentlyInTransaction");
  const body = queries.slice(start, queries.indexOf("export async function deleteUserForAdmin", start));
  expect(body.indexOf("await claimAccountFilesForCleanup(tx, id)")).toBeGreaterThan(
    body.indexOf('DELETE FROM "Chat"')
  );

  for (const route of ["app/api/admin/users/[id]/route.ts", "app/api/admin/users/bulk/route.ts"]) {
    const source = readFileSync(route, "utf8");
    const guard = source.indexOf('if (mode === "permanent") {');
    expect(guard).toBeGreaterThan(0);
    expect(source.indexOf("deleteAccountAvatarBlobs(", guard)).toBeGreaterThan(guard);
  }
});
