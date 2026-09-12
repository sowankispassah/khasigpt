ALTER TABLE "ModelConfig"
  ADD COLUMN IF NOT EXISTS "markupMultiplier" double precision NOT NULL DEFAULT 4;

ALTER TABLE "ImageModelConfig"
  ADD COLUMN IF NOT EXISTS "providerCostPerOutputUsd" double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "markupMultiplier" double precision NOT NULL DEFAULT 2;

ALTER TABLE "LiveVoiceModelConfig"
  ADD COLUMN IF NOT EXISTS "markupMultiplier" double precision NOT NULL DEFAULT 3;

UPDATE "LiveVoiceModelConfig"
SET "markupMultiplier" = LEAST(20, GREATEST(1, "creditMultiplier"))
WHERE "creditMultiplier" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "CreditCharge" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "chatId" uuid REFERENCES "Chat"("id") ON DELETE SET NULL,
  "subscriptionId" uuid REFERENCES "UserSubscription"("id") ON DELETE SET NULL,
  "tokenUsageId" uuid REFERENCES "token_usage"("id") ON DELETE SET NULL,
  "modelConfigId" uuid REFERENCES "ModelConfig"("id") ON DELETE SET NULL,
  "imageModelConfigId" uuid REFERENCES "ImageModelConfig"("id") ON DELETE SET NULL,
  "liveVoiceModelConfigId" uuid REFERENCES "LiveVoiceModelConfig"("id") ON DELETE SET NULL,
  "category" varchar(32) NOT NULL,
  "providerKey" varchar(64),
  "requestKey" varchar(191),
  "inputTokens" integer NOT NULL DEFAULT 0,
  "outputTokens" integer NOT NULL DEFAULT 0,
  "unitCount" integer NOT NULL DEFAULT 0,
  "providerCostUsd" double precision NOT NULL DEFAULT 0,
  "usdToInr" double precision NOT NULL DEFAULT 0,
  "markupMultiplier" double precision NOT NULL DEFAULT 1,
  "customerChargeInr" double precision NOT NULL DEFAULT 0,
  "creditUnits" integer NOT NULL DEFAULT 0,
  "manualCreditUnits" integer NOT NULL DEFAULT 0,
  "paidCreditUnits" integer NOT NULL DEFAULT 0,
  "pricingMetadata" jsonb,
  "status" varchar(24) NOT NULL DEFAULT 'settled',
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "CreditCharge_user_createdAt_idx"
  ON "CreditCharge" ("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "CreditCharge_chat_idx"
  ON "CreditCharge" ("chatId");

CREATE INDEX IF NOT EXISTS "CreditCharge_tokenUsage_idx"
  ON "CreditCharge" ("tokenUsageId");

CREATE UNIQUE INDEX IF NOT EXISTS "CreditCharge_requestKey_idx"
  ON "CreditCharge" ("requestKey")
  WHERE "requestKey" IS NOT NULL;

ALTER TABLE "CreditCharge" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "CreditCharge" FROM anon, authenticated;
