ALTER TABLE "Chat"
ADD COLUMN IF NOT EXISTS "mode" varchar(16) NOT NULL DEFAULT 'default';

UPDATE "Chat"
SET "mode" = 'default'
WHERE "mode" IS NULL OR "mode" NOT IN ('default', 'study');
