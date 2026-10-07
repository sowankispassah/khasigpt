import { desc, sql } from "drizzle-orm";
import { chat, message, user } from "@/lib/db/schema";

export function adminUserRecentChatOrderBy() {
  // Read only the latest user message per chat using the existing
  // Message_v2(chatId, role, createdAt) index, including continued conversations.
  const lastChatAt = sql<Date | null>`(
    SELECT MAX((
      SELECT m."createdAt"
      FROM ${message} m
      WHERE m."chatId" = c."id" AND m."role" = 'user'
      ORDER BY m."createdAt" DESC
      LIMIT 1
    ))
    FROM ${chat} c
    WHERE c."userId" = ${user.id}
  )`;

  return [
    sql`${lastChatAt} DESC NULLS LAST`,
    desc(user.createdAt),
    desc(user.id),
  ];
}
