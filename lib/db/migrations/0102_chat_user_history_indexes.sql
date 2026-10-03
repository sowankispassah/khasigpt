CREATE INDEX IF NOT EXISTS "Chat_user_idx"
  ON "Chat" ("userId");

CREATE INDEX IF NOT EXISTS "Chat_user_createdAt_deleted_idx"
  ON "Chat" ("userId", "createdAt", "id")
  WHERE "deletedAt" IS NOT NULL;
