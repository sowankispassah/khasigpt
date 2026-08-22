CREATE TABLE IF NOT EXISTS "TranslationFeatureLanguage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" varchar(16) NOT NULL,
  "name" varchar(64) NOT NULL,
  "isDefault" boolean NOT NULL DEFAULT false,
  "isActive" boolean NOT NULL DEFAULT true,
  "systemPrompt" text,
  "modelConfigId" uuid REFERENCES "ModelConfig"("id") ON DELETE SET NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "TranslationFeatureLanguage_code_idx"
  ON "TranslationFeatureLanguage" ("code");

CREATE INDEX IF NOT EXISTS "TranslationFeatureLanguage_active_idx"
  ON "TranslationFeatureLanguage" ("isActive");

CREATE INDEX IF NOT EXISTS "TranslationFeatureLanguage_model_idx"
  ON "TranslationFeatureLanguage" ("modelConfigId");

INSERT INTO "TranslationFeatureLanguage" (
  "code",
  "name",
  "isDefault",
  "isActive",
  "systemPrompt",
  "modelConfigId"
)
SELECT
  'en',
  'English',
  true,
  true,
  'Translate into English naturally while preserving meaning, tone, and formatting.',
  (
    SELECT "id"
    FROM "ModelConfig"
    WHERE "deletedAt" IS NULL
      AND "isEnabled" = true
    ORDER BY "isDefault" DESC, "createdAt" ASC
    LIMIT 1
  )
WHERE NOT EXISTS (
  SELECT 1
  FROM "TranslationFeatureLanguage"
  WHERE "code" = 'en'
);
