CREATE INDEX IF NOT EXISTS "Character_updatedAt_idx"
ON public."Character" ("updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "Coupon_createdAt_idx"
ON public."Coupon" ("createdAt" DESC);

CREATE INDEX IF NOT EXISTS "CouponRedemption_coupon_createdAt_idx"
ON public."CouponRedemption" ("couponId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "CouponRewardPayout_coupon_createdAt_idx"
ON public."CouponRewardPayout" ("couponId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "language_active_idx"
ON public."language" ("isActive");
