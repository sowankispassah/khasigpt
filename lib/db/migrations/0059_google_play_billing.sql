ALTER TABLE "PricingPlan"
  ADD COLUMN IF NOT EXISTS "androidProductId" varchar(191);

ALTER TABLE "PaymentTransaction"
  ADD COLUMN IF NOT EXISTS "provider" varchar(32) NOT NULL DEFAULT 'razorpay',
  ADD COLUMN IF NOT EXISTS "providerProductId" varchar(191),
  ADD COLUMN IF NOT EXISTS "providerPurchaseTokenHash" varchar(64);

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentTransaction_provider_purchase_token_hash_idx"
ON "PaymentTransaction" ("providerPurchaseTokenHash")
WHERE "providerPurchaseTokenHash" IS NOT NULL;
