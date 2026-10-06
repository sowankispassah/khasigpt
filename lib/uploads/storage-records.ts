import "server-only";

import { and, eq, or, sql } from "drizzle-orm";
import { withAdminDatabase } from "@/lib/db/admin-database";
import { chatFile } from "@/lib/db/schema";
import { privateFileOwner } from "@/lib/uploads/private-file-key";

export async function reserveChatFile(key: string, bytes: number) {
  const owner = privateFileOwner(key);
  if (!owner || !Number.isSafeInteger(bytes) || bytes <= 0) throw new Error("Invalid private file.");
  const rows = await withAdminDatabase("storage.reserve", db => db.insert(chatFile).values({ key, userId: owner, bytes }).onConflictDoNothing().returning({ key: chatFile.key }), { retry: false });
  if (!rows.length) throw new Error("Private file already registered.");
}

export async function confirmChatFile(key: string, etag: string) {
  if (!etag) throw new Error("Private file metadata is unavailable.");
  // Inventory can observe the completed object before this upload's callback.
  // Accept its matching ready record without double-counting the stored bytes.
  const rows = await withAdminDatabase("storage.confirm", db => db.update(chatFile).set({ confirmed: true, etag, state: "ready", observedAt: new Date() }).where(and(eq(chatFile.key, key), or(eq(chatFile.state, "reserved"), and(eq(chatFile.state, "ready"), eq(chatFile.etag, etag))))).returning({ key: chatFile.key }), { retry: false });
  if (!rows.length) throw new Error("Private file cannot be confirmed.");
}

export async function observeChatFiles(files: Array<{ pathname: string; size: number; uploadedAt: Date; etag: string }>) {
  const values = files.flatMap(file => {
    const owner = privateFileOwner(file.pathname);
    if (!owner || !Number.isSafeInteger(file.size) || file.size <= 0 || !Number.isFinite(file.uploadedAt.getTime()) || !file.etag) return [];
    return [{ key: file.pathname, userId: owner, bytes: file.size, createdAt: file.uploadedAt, observedAt: new Date(), confirmed: true, etag: file.etag, state: "ready" as const }];
  });
  if (!values.length) return 0;
  // Separate autocommit upserts release file/account locks between objects.
  // A multi-object transaction can deadlock against a concurrent upload that
  // confirms its own file before updating the same account's byte counter.
  for (let offset = 0; offset < values.length; offset += 5) {
    await withAdminDatabase("storage.inventory", async db => {
      for (const value of values.slice(offset, offset + 5)) await db.insert(chatFile).values(value).onConflictDoUpdate({
        target: chatFile.key,
        set: {
          bytes: sql`excluded."bytes"`, etag: sql`CASE WHEN "ChatFile"."state" = 'deleting' THEN "ChatFile"."etag" ELSE excluded."etag" END`, confirmed: true,
          createdAt: sql`excluded."createdAt"`, observedAt: new Date(),
          unreferencedAt: sql`CASE WHEN "ChatFile"."confirmed" AND "ChatFile"."etag" IS DISTINCT FROM excluded."etag" THEN now() ELSE "ChatFile"."unreferencedAt" END`,
          state: sql`CASE WHEN "ChatFile"."state" = 'deleted' THEN 'reserved' WHEN "ChatFile"."state" = 'deleting' THEN 'deleting' ELSE 'ready' END`,
        },
      });
    }, { retry: false });
  }
  return values.length;
}
