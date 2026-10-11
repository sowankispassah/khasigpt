import nextDynamic from "next/dynamic";
import { AdminPageLoading } from "@/components/admin/admin-page-loading";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { AdminReferralsManager } from "@/components/admin-referrals-manager";
import { adminQueryResult } from "@/lib/admin/safe-query";
import {
  getCouponPayoutsForAdmin,
  getCouponRedemptionsForAdmin,
  listCouponsWithStats,
  listCreators,
} from "@/lib/db/queries";
import { requireAdminPageSession } from "@/lib/security/admin-session";

export const dynamic = "force-dynamic";

const AdminCouponsManager = nextDynamic(
  () =>
    import("@/components/admin-coupons-manager").then(
      (module) => module.AdminCouponsManager
    ),
  {
    loading: () => <AdminPageLoading rows={7} summaryCards={2} titleWidth="w-36" />,
  }
);

export default async function AdminCouponsPage() {
  await requireAdminPageSession();

  const [couponsState, creatorsState] = await Promise.all([
    adminQueryResult({
      fallback: [] as Awaited<ReturnType<typeof listCouponsWithStats>>,
      label: "coupons.list",
      promise: listCouponsWithStats(),
    }),
    adminQueryResult({
      fallback: [] as Awaited<ReturnType<typeof listCreators>>,
      label: "coupons.creators",
      promise: listCreators(),
    }),
  ]);
  const coupons = couponsState.data;
  const couponIdList = coupons.map((coupon) => coupon.id);
  const [redemptionsState, payoutsState] = await Promise.all([
    adminQueryResult({
      fallback: {} as Awaited<ReturnType<typeof getCouponRedemptionsForAdmin>>,
      label: "coupons.redemptions",
      promise: getCouponRedemptionsForAdmin({
        couponIds: couponIdList,
        limitPerCoupon: 8,
      }),
    }),
    adminQueryResult({
      fallback: {} as Awaited<ReturnType<typeof getCouponPayoutsForAdmin>>,
      label: "coupons.payouts",
      promise: getCouponPayoutsForAdmin({
        couponIds: couponIdList,
        limitPerCoupon: 5,
      }),
    }),
  ]);
  const redemptionsMap = redemptionsState.data;
  const payoutsMap = payoutsState.data;
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

  const creatorOptions = creatorsState.data.map((creator) => ({
    id: creator.id,
    name:
      [creator.firstName, creator.lastName].filter(Boolean).join(" ").trim() ||
      creator.email ||
      "Unnamed creator",
    email: creator.email ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        description="Creator coupon codes and referral links: who redeemed them, the revenue they drove, and the rewards owed."
        navHref="/admin/coupons"
        title="Coupons & referrals"
      />

      <AdminCouponsManager
        coupons={serializedCoupons}
        couponsConfirmed={couponsState.ok}
        creators={creatorOptions}
        creatorsConfirmed={creatorsState.ok}
        payoutsConfirmed={payoutsState.ok}
        redemptionsConfirmed={redemptionsState.ok}
      />
      <AdminReferralsManager creators={creatorOptions} creatorsConfirmed={creatorsState.ok} />
    </div>
  );
}
