ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "signupReferralCode" varchar(64);
CREATE INDEX IF NOT EXISTS "User_signup_referral_idx" ON "User" ("signupReferralCode", "createdAt");
CREATE TABLE IF NOT EXISTS "CreatorReferral" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "code" varchar(64) NOT NULL UNIQUE,
  "creatorId" uuid NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "percentage" integer NOT NULL CHECK ("percentage" BETWEEN 1 AND 100),
  "duration" varchar(20) NOT NULL CHECK ("duration" IN ('indefinite','months','first_recharge','signup_window')),
  "months" integer, "windowDays" integer, "rechargeBefore" timestamp,
  "isActive" boolean NOT NULL DEFAULT true, "createdAt" timestamp NOT NULL DEFAULT now(),
  CHECK (("duration" = 'months' AND "months" IS NOT NULL AND "months" BETWEEN 1 AND 1200) OR ("duration" <> 'months' AND "months" IS NULL)),
  CHECK (("duration" = 'signup_window' AND (("windowDays" BETWEEN 1 AND 36500 AND "rechargeBefore" IS NULL) OR ("windowDays" IS NULL AND "rechargeBefore" IS NOT NULL))) OR ("duration" <> 'signup_window' AND "windowDays" IS NULL AND "rechargeBefore" IS NULL))
);
CREATE INDEX IF NOT EXISTS "CreatorReferral_creator_idx" ON "CreatorReferral" ("creatorId", "createdAt");
CREATE TABLE IF NOT EXISTS "ReferralCommission" (
  "orderId" varchar(64) PRIMARY KEY REFERENCES "PaymentTransaction"("orderId") ON DELETE RESTRICT,
  "referralId" uuid NOT NULL REFERENCES "CreatorReferral"("id") ON DELETE RESTRICT,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "creatorId" uuid NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "percentage" integer NOT NULL CHECK ("percentage" BETWEEN 1 AND 100),
  "paymentAmount" integer NOT NULL CHECK ("paymentAmount" > 0),
  "amount" integer NOT NULL CHECK ("amount" >= 0), "currency" varchar(16) NOT NULL,
  "reversed" boolean NOT NULL DEFAULT false, "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ReferralCommission_creator_idx" ON "ReferralCommission" ("creatorId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReferralCommission_user_idx" ON "ReferralCommission" ("userId");
CREATE INDEX IF NOT EXISTS "ReferralCommission_referral_idx" ON "ReferralCommission" ("referralId");
CREATE TABLE IF NOT EXISTS "ReferralPayout" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(), "referralId" uuid NOT NULL REFERENCES "CreatorReferral"("id") ON DELETE RESTRICT,
  "amount" integer NOT NULL CHECK ("amount" > 0), "currency" varchar(16) NOT NULL,
  "note" text, "recordedBy" uuid NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ReferralPayout_referral_idx" ON "ReferralPayout" ("referralId", "createdAt");
ALTER TABLE "CreatorReferral" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReferralCommission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReferralPayout" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "CreatorReferral", "ReferralCommission", "ReferralPayout" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "CreatorReferral", "ReferralCommission", "ReferralPayout" FROM authenticated;
  END IF;
END $$;
INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES ('creator.referrals.access', '"admin_only"'::jsonb, now()), ('billing.coupons.access', '"disabled"'::jsonb, now()) ON CONFLICT ("key") DO NOTHING;
