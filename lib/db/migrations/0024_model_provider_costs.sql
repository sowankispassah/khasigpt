ALTER TABLE "ModelConfig"
ADD COLUMN "inputProviderCostPerMillion" double precision DEFAULT 0 NOT NULL,
ADD COLUMN "outputProviderCostPerMillion" double precision DEFAULT 0 NOT NULL;
