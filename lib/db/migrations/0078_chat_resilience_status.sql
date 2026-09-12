ALTER TABLE "Chat"
  ADD COLUMN IF NOT EXISTS "status" varchar NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS "statusReason" text;

ALTER TABLE "Chat"
  DROP CONSTRAINT IF EXISTS "Chat_status_check";

ALTER TABLE "Chat"
  ADD CONSTRAINT "Chat_status_check"
  CHECK ("status" IN ('pending', 'completed', 'failed', 'cancelled'));

UPDATE "Chat"
SET "status" = 'completed'
WHERE "status" IS NULL;

CREATE INDEX IF NOT EXISTS "Chat_status_createdAt_idx"
  ON "Chat" ("status", "createdAt");

CREATE INDEX IF NOT EXISTS "Chat_user_status_createdAt_active_idx"
  ON "Chat" ("userId", "status", "createdAt")
  WHERE "deletedAt" IS NULL;
