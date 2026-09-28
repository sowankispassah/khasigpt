ALTER TABLE IF EXISTS "ContactMessage"
  ADD COLUMN IF NOT EXISTS "kind" varchar(16) NOT NULL DEFAULT 'contact',
  ADD COLUMN IF NOT EXISTS "isViewed" boolean NOT NULL DEFAULT false;

UPDATE "ContactMessage"
SET "kind" = 'report'
WHERE "kind" = 'contact'
  AND lower("subject") IN ('ai content report', 'ai response feedback');

CREATE INDEX IF NOT EXISTS "ContactMessage_kind_createdAt_idx"
  ON "ContactMessage" ("kind", "createdAt");

CREATE INDEX IF NOT EXISTS "ContactMessage_kind_isViewed_createdAt_idx"
  ON "ContactMessage" ("kind", "isViewed", "createdAt");
