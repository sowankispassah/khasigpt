DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ImageModelConfig'
      AND column_name = 'inputProviderCostPerMillion'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ImageModelConfig'
      AND column_name = 'textInputProviderCostPerMillion'
  ) THEN
    ALTER TABLE "ImageModelConfig"
      RENAME COLUMN "inputProviderCostPerMillion"
      TO "textInputProviderCostPerMillion";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ImageModelConfig'
      AND column_name = 'outputProviderCostPerMillion'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ImageModelConfig'
      AND column_name = 'imageOutputProviderCostPerMillion'
  ) THEN
    ALTER TABLE "ImageModelConfig"
      RENAME COLUMN "outputProviderCostPerMillion"
      TO "imageOutputProviderCostPerMillion";
  END IF;
END $$;

ALTER TABLE "ImageModelConfig"
  ADD COLUMN IF NOT EXISTS "textInputProviderCostPerMillion" double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "imageOutputProviderCostPerMillion" double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "imageInputProviderCostPerMillion" double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cachedTextInputProviderCostPerMillion" double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cachedImageInputProviderCostPerMillion" double precision NOT NULL DEFAULT 0;

ALTER TABLE "CreditCharge"
  ADD COLUMN IF NOT EXISTS "textInputTokens" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "imageInputTokens" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cachedTextInputTokens" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cachedImageInputTokens" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "imageOutputTokens" integer NOT NULL DEFAULT 0;
