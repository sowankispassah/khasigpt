CREATE INDEX IF NOT EXISTS "Chat_user_createdAt_id_active_idx"
ON "Chat" ("userId", "createdAt", "id")
WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Chat_user_mode_createdAt_id_active_idx"
ON "Chat" ("userId", "mode", "createdAt", "id")
WHERE "deletedAt" IS NULL;
