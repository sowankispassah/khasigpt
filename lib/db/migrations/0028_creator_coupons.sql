ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'creator';

CREATE TABLE "Coupon" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "code" varchar(64) NOT NULL,
    "discountPercentage" integer NOT NULL,
    "creatorRewardPercentage" integer NOT NULL DEFAULT 0,
    "creatorRewardStatus" varchar(16) NOT NULL DEFAULT 'pending',
    "creatorId" uuid NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE,
    "validFrom" timestamp NOT NULL DEFAULT now(),
    "validTo" timestamp,
    "isActive" boolean NOT NULL DEFAULT true,
    "description" text,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "Coupon_code_idx" ON "Coupon" ("code");
CREATE INDEX "Coupon_creator_idx" ON "Coupon" ("creatorId");

ALTER TABLE "PaymentTransaction"
  ADD COLUMN "couponId" uuid REFERENCES "Coupon" ("id") ON DELETE SET NULL,
  ADD COLUMN "creatorId" uuid REFERENCES "User" ("id") ON DELETE SET NULL,
  ADD COLUMN "discountAmount" integer NOT NULL DEFAULT 0;

CREATE INDEX "PaymentTransaction_coupon_idx" ON "PaymentTransaction" ("couponId");

CREATE TABLE "CouponRedemption" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "couponId" uuid NOT NULL REFERENCES "Coupon" ("id") ON DELETE CASCADE,
    "userId" uuid NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE,
    "creatorId" uuid NOT NULL REFERENCES "User" ("id") ON DELETE CASCADE,
    "planId" uuid NOT NULL REFERENCES "PricingPlan" ("id") ON DELETE RESTRICT,
    "orderId" varchar(64) NOT NULL REFERENCES "PaymentTransaction" ("orderId") ON DELETE CASCADE,
    "paymentAmount" integer NOT NULL,
    "discountAmount" integer NOT NULL DEFAULT 0,
    "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "CouponRedemption_order_idx" ON "CouponRedemption" ("orderId");
CREATE INDEX "CouponRedemption_coupon_idx" ON "CouponRedemption" ("couponId");
CREATE INDEX "CouponRedemption_creator_idx" ON "CouponRedemption" ("creatorId");
CREATE INDEX "CouponRedemption_user_idx" ON "CouponRedemption" ("userId");
