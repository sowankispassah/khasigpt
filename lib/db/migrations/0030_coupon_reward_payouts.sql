CREATE TABLE IF NOT EXISTS "CouponRewardPayout" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "couponId" uuid NOT NULL REFERENCES "Coupon"("id") ON DELETE CASCADE,
  "amount" integer NOT NULL,
  "note" text,
  "recordedBy" uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "CouponRewardPayout_coupon_idx" ON "CouponRewardPayout" ("couponId");
