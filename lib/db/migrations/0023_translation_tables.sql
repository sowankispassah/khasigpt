CREATE TABLE IF NOT EXISTS "language" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" varchar(16) NOT NULL,
  "name" varchar(64) NOT NULL,
  "isDefault" boolean NOT NULL DEFAULT false,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "language_code_idx" ON "language" ("code");

CREATE TABLE IF NOT EXISTS "translation_key" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" varchar(128) NOT NULL,
  "defaultText" text NOT NULL,
  "description" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "translation_key_key_idx" ON "translation_key" ("key");

CREATE TABLE IF NOT EXISTS "translation_value" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "translationKeyId" uuid NOT NULL REFERENCES "translation_key"("id") ON DELETE CASCADE,
  "languageId" uuid NOT NULL REFERENCES "language"("id") ON DELETE CASCADE,
  "value" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "translation_value_key_lang_idx" ON "translation_value" ("translationKeyId", "languageId");

INSERT INTO "language" ("code", "name", "isDefault", "isActive")
VALUES
  ('en', 'English', true, true),
  ('kha', 'Khasi', false, true)
ON CONFLICT ("code") DO UPDATE
SET
  "name" = excluded."name",
  "isDefault" = excluded."isDefault",
  "isActive" = excluded."isActive",
  "updatedAt" = now();
