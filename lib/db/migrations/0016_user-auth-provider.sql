DO $$
BEGIN
  CREATE TYPE auth_provider AS ENUM ('credentials', 'google');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "authProvider" auth_provider DEFAULT 'credentials';

UPDATE "User"
SET "authProvider" = 'google'
WHERE "authProvider" IS NULL
  AND "password" IS NULL;

UPDATE "User"
SET "authProvider" = 'credentials'
WHERE "authProvider" IS NULL;

ALTER TABLE "User"
ALTER COLUMN "authProvider" SET NOT NULL;

ALTER TABLE "User"
ALTER COLUMN "authProvider" SET DEFAULT 'credentials';
