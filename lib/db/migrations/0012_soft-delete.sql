ALTER TABLE "Chat"
ADD COLUMN IF NOT EXISTS "deletedAt" timestamp;

ALTER TABLE "ModelConfig"
ADD COLUMN IF NOT EXISTS "deletedAt" timestamp;

ALTER TABLE "PricingPlan"
ADD COLUMN IF NOT EXISTS "deletedAt" timestamp;
