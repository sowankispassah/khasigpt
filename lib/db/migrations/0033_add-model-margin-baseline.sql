ALTER TABLE "ModelConfig"
ADD COLUMN "isMarginBaseline" boolean NOT NULL DEFAULT false;

UPDATE "ModelConfig"
SET "isMarginBaseline" = true
WHERE "isDefault" = true
  AND "deletedAt" IS NULL;
