ALTER TABLE "TranslationFeatureLanguage"
  ADD COLUMN IF NOT EXISTS "speechModelConfigId" uuid REFERENCES "ModelConfig"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "TranslationFeatureLanguage_speech_model_idx"
  ON "TranslationFeatureLanguage" ("speechModelConfigId");
