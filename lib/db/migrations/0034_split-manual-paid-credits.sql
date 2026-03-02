ALTER TABLE "UserSubscription"
  ADD COLUMN "manualTokenBalance" integer NOT NULL DEFAULT 0,
  ADD COLUMN "paidTokenBalance" integer NOT NULL DEFAULT 0;

ALTER TABLE "token_usage"
  ADD COLUMN "manualTokens" integer NOT NULL DEFAULT 0,
  ADD COLUMN "paidTokens" integer NOT NULL DEFAULT 0;

UPDATE "UserSubscription" AS us
SET
  "manualTokenBalance" = CASE
    WHEN COALESCE(pp."priceInPaise", 0) > 0 THEN 0
    ELSE us."tokenBalance"
  END,
  "paidTokenBalance" = CASE
    WHEN COALESCE(pp."priceInPaise", 0) > 0 THEN us."tokenBalance"
    ELSE 0
  END
FROM "PricingPlan" AS pp
WHERE us."planId" = pp."id";

UPDATE "token_usage" AS tu
SET
  "manualTokens" = CASE
    WHEN COALESCE(pp."priceInPaise", 0) > 0 THEN 0
    ELSE tu."totalTokens"
  END,
  "paidTokens" = CASE
    WHEN COALESCE(pp."priceInPaise", 0) > 0 THEN tu."totalTokens"
    ELSE 0
  END
FROM "UserSubscription" AS us
JOIN "PricingPlan" AS pp ON us."planId" = pp."id"
WHERE tu."subscriptionId" = us."id";
