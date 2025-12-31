import { redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import { AdminCouponsManager } from "@/components/admin-coupons-manager";
import {
  getCouponPayoutsForAdmin,
  getCouponRedemptionsForAdmin,
  listCouponsWithStats,
  listCreators,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function AdminCouponsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/admin/coupons");
  }

  if (session.user.role !== "admin") {
    redirect("/");
  }

  const [coupons, creators] = await Promise.all([
    listCouponsWithStats(),
    listCreators(),
  ]);
  const couponIdList = coupons.map((coupon) => coupon.id);
  const [redemptionsMap, payoutsMap] = await Promise.all([
    getCouponRedemptionsForAdmin({
      couponIds: couponIdList,
      limitPerCoupon: 8,
    }),
    getCouponPayoutsForAdmin({
      couponIds: couponIdList,
      limitPerCoupon: 5,
    }),
  ]);
  const fallbackNowIso = new Date().toISOString();
  const toIsoString = (
    value: Date | string | null | undefined
  ): string | null => {
    if (!value) {
      return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString();
  };

  const serializedCoupons = coupons.map((coupon) => ({
    id: coupon.id,
    code: coupon.code,
    discountPercentage: coupon.discountPercentage,
    creatorRewardPercentage: coupon.creatorRewardPercentage,
    creatorRewardStatus: coupon.creatorRewardStatus,
    creatorId: coupon.creatorId,
    creatorName: coupon.creatorName,
    creatorEmail: coupon.creatorEmail,
    validFrom: toIsoString(coupon.validFrom) ?? fallbackNowIso,
    validTo: toIsoString(coupon.validTo),
    isActive: coupon.isActive,
    description: coupon.description,
    usageCount: coupon.usageCount,
    totalRevenueInPaise: coupon.totalRevenueInPaise,
    totalDiscountInPaise: coupon.totalDiscountInPaise,
    estimatedRewardInPaise: coupon.estimatedRewardInPaise,
    totalPaidInPaise: coupon.totalPaidInPaise,
    remainingRewardInPaise: Math.max(
      coupon.estimatedRewardInPaise - coupon.totalPaidInPaise,
      0
    ),
    lastRedemptionAt: toIsoString(coupon.lastRedemptionAt),
    recentRedemptions: (redemptionsMap[coupon.id] ?? []).map((redemption) => ({
      id: redemption.id,
      couponCode: redemption.couponCode,
      userLabel: redemption.userLabel,
      paymentAmountInPaise: redemption.paymentAmountInPaise,
      discountAmountInPaise: redemption.discountAmountInPaise,
      rewardInPaise: redemption.rewardInPaise,
      redeemedAt: redemption.createdAt.toISOString(),
    })),
    recentPayouts: (payoutsMap[coupon.id] ?? []).map((payout) => ({
      id: payout.id,
      amountInPaise: payout.amount,
      note: payout.note ?? null,
      createdAt: payout.createdAt.toISOString(),
    })),
  }));

  const creatorOptions = creators.map((creator) => ({
    id: creator.id,
    name:
      [creator.firstName, creator.lastName].filter(Boolean).join(" ").trim() ||
      creator.email ||
      "Unnamed creator",
    email: creator.email ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-semibold text-2xl">Coupons & referrals</h1>
        <p className="text-muted-foreground text-sm">
          Assign codes to creators, manage validity windows, and monitor
          performance.
        </p>
      </header>

      <AdminCouponsManager
        coupons={serializedCoupons}
        creators={creatorOptions}
      />
    </div>
  );
}
