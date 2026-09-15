ALTER TABLE "ImageModelConfig"
  ADD COLUMN IF NOT EXISTS "providerCostType" varchar(24) NOT NULL DEFAULT 'per_generation',
  ADD COLUMN IF NOT EXISTS "inputProviderCostPerMillion" double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "outputProviderCostPerMillion" double precision NOT NULL DEFAULT 0;

UPDATE "ImageModelConfig"
SET "providerCostType" = 'per_generation'
WHERE "providerCostType" IS NULL
   OR "providerCostType" NOT IN ('per_generation', 'per_token');

ALTER TABLE "ImageModelConfig"
  DROP CONSTRAINT IF EXISTS "ImageModelConfig_providerCostType_check";

ALTER TABLE "ImageModelConfig"
  ADD CONSTRAINT "ImageModelConfig_providerCostType_check"
  CHECK ("providerCostType" IN ('per_generation', 'per_token'));
