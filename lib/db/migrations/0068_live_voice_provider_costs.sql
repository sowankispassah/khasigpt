ALTER TABLE "LiveVoiceModelConfig"
  ADD COLUMN IF NOT EXISTS "inputProviderCostPerMillion" double precision DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "outputProviderCostPerMillion" double precision DEFAULT 0 NOT NULL;
