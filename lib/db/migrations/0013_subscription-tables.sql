CREATE TYPE IF NOT EXISTS "subscription_status" AS ENUM ('active','expired','exhausted','cancelled');

CREATE TABLE IF NOT EXISTS "PricingPlan" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(128) NOT NULL,
  "description" text,
  "priceInPaise" integer NOT NULL,
  "tokenAllowance" integer NOT NULL,
  "billingCycleDays" integer NOT NULL,
  "isActive" boolean DEFAULT true NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "UserSubscription" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "planId" uuid NOT NULL REFERENCES "PricingPlan"("id") ON DELETE RESTRICT,
  "status" subscription_status NOT NULL DEFAULT 'active',
  "tokenAllowance" integer NOT NULL,
  "tokenBalance" integer NOT NULL,
  "tokensUsed" integer NOT NULL DEFAULT 0,
  "startedAt" timestamp NOT NULL DEFAULT now(),
  "expiresAt" timestamp NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "token_usage"
ADD COLUMN IF NOT EXISTS "subscriptionId" uuid;

ALTER TABLE "token_usage"
ADD CONSTRAINT IF NOT EXISTS "token_usage_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "UserSubscription"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "token_usage_subscription_idx" ON "token_usage"("subscriptionId");

INSERT INTO "PricingPlan" (
  "id",
  "name",
  "description",
  "priceInPaise",
  "tokenAllowance",
  "billingCycleDays",
  "isActive"
)
VALUES (
  '00000000-0000-0000-0000-0000000000ff',
  'Manual credit top-up',
  'Credits granted directly by an administrator',
  0,
  0,
  365,
  false
)
ON CONFLICT ("id") DO NOTHING;
