ALTER TABLE "language"
  ADD COLUMN IF NOT EXISTS "systemPrompt" text,
  ADD COLUMN IF NOT EXISTS "syncUiLanguage" boolean NOT NULL DEFAULT false;

UPDATE "language"
SET
  "systemPrompt" = CASE
    WHEN "code" = 'kha' AND ("systemPrompt" IS NULL OR "systemPrompt" = '')
      THEN 'Respond in Khasi.'
    WHEN "code" = 'en' AND ("systemPrompt" IS NULL OR "systemPrompt" = '')
      THEN 'Respond in English.'
    ELSE "systemPrompt"
  END,
  "syncUiLanguage" = CASE
    WHEN "code" = 'kha' THEN true
    ELSE "syncUiLanguage"
  END;
