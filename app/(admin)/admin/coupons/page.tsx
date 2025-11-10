import { redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import { AdminCouponsManager } from "@/components/admin-coupons-manager";
import { listCouponsWithStats, listCreators } from "@/lib/db/queries";

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

  const serializedCoupons = coupons.map((coupon) => ({
    id: coupon.id,
    code: coupon.code,
    discountPercentage: coupon.discountPercentage,
    creatorRewardPercentage: coupon.creatorRewardPercentage,
    creatorRewardStatus: coupon.creatorRewardStatus,
    creatorId: coupon.creatorId,
    creatorName: coupon.creatorName,
    creatorEmail: coupon.creatorEmail,
    validFrom: coupon.validFrom?.toISOString() ?? new Date().toISOString(),
    validTo: coupon.validTo ? coupon.validTo.toISOString() : null,
    isActive: coupon.isActive,
    description: coupon.description,
    usageCount: coupon.usageCount,
    totalRevenueInPaise: coupon.totalRevenueInPaise,
    totalDiscountInPaise: coupon.totalDiscountInPaise,
    estimatedRewardInPaise: coupon.estimatedRewardInPaise,
    lastRedemptionAt: coupon.lastRedemptionAt
      ? coupon.lastRedemptionAt.toISOString()
      : null,
  }));

  const creatorOptions = creators.map((creator) => ({
    id: creator.id,
    name:
      [creator.firstName, creator.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || creator.email || "Unnamed creator",
    email: creator.email ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Coupons & referrals</h1>
        <p className="text-muted-foreground text-sm">
          Assign codes to creators, manage validity windows, and monitor performance.
        </p>
      </header>

      <AdminCouponsManager coupons={serializedCoupons} creators={creatorOptions} />
    </div>
  );
}
