import "server-only";

import { del, list } from "@vercel/blob";

const ACCOUNT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Profile photos are public blobs under avatars/<userId>/, outside the private
// chat-file registry, so account deletion removes them directly. Uploads and
// generated images go to the daily storage cleanup inside the deletion
// transaction instead (claimAccountFilesForCleanup).
export async function deleteAccountAvatarBlobs(userId: string) {
  if (!ACCOUNT_ID_PATTERN.test(userId)) {
    throw new Error("Invalid account id.");
  }
  const prefix = `avatars/${userId}/`;
  let deleted = 0;
  let cursor: string | undefined;
  do {
    const page = await list({
      prefix,
      cursor,
      limit: 1000,
      abortSignal: AbortSignal.timeout(20_000),
    });
    const urls = page.blobs
      .filter((blob) => blob.pathname.startsWith(prefix))
      .map((blob) => blob.url);
    if (urls.length > 0) {
      await del(urls, { abortSignal: AbortSignal.timeout(20_000) });
      deleted += urls.length;
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return deleted;
}
