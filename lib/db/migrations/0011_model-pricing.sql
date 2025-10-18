ALTER TABLE "ModelConfig"
ADD COLUMN "inputCostPerMillion" double precision DEFAULT 0 NOT NULL;

ALTER TABLE "ModelConfig"
ADD COLUMN "outputCostPerMillion" double precision DEFAULT 0 NOT NULL;
