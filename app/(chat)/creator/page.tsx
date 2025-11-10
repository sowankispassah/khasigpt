import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import { BackToHomeButton } from "@/app/(chat)/profile/back-to-home-button";
import { getCreatorCouponSummary } from "@/lib/db/queries";
import { getTranslationBundle } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});
const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default async function CreatorDashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/creator");
  }

  if (session.user.role !== "creator") {
    redirect("/");
  }

  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const [bundle, summary] = await Promise.all([
    getTranslationBundle(preferredLanguage),
    getCreatorCouponSummary(session.user.id),
  ]);
  const dictionary = bundle.dictionary;
  const t = (key: string, fallback: string) => dictionary[key] ?? fallback;

  const couponSummary = summary ?? {
    creator: {
      id: session.user.id,
      name: session.user.name ?? session.user.email ?? "",
      email: session.user.email ?? null,
    },
    coupons: [],
    totals: {
      usageCount: 0,
      totalRevenueInPaise: 0,
      totalDiscountInPaise: 0,
      totalRewardInPaise: 0,
      pendingRewardInPaise: 0,
    },
  };

  const totalDiscount = couponSummary.totals.totalDiscountInPaise / 100;
  const totalReward = couponSummary.totals.totalRewardInPaise / 100;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
      <div className="flex flex-col gap-4">
        <BackToHomeButton label={t("navigation.back_to_home", "Back to home")} />
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            {t("creator_dashboard.tagline", "Creator dashboard")}
          </p>
          <h1 className="text-3xl font-semibold">
            {t("creator_dashboard.title", "Share coupons and track performance")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t(
              "creator_dashboard.subtitle",
              "Monitor how your community redeems coupons, how much revenue you helped generate, and when each code expires."
            )}
          </p>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label={t("creator_dashboard.metrics.redemptions", "Total redemptions")}
          value={couponSummary.totals.usageCount.toLocaleString("en-IN")}
        />
        <MetricCard
          label={t("creator_dashboard.metrics.savings", "User savings")}
          value={currencyFormatter.format(totalDiscount)}
        />
        <MetricCard
          label={t("creator_dashboard.metrics.rewards", "Your rewards")}
          value={currencyFormatter.format(totalReward)}
        />
      </section>

      <section className="rounded-2xl border bg-card/70 shadow-sm">
        <header className="flex flex-col gap-2 border-b px-4 py-4 sm:px-6">
          <h2 className="text-lg font-semibold">
            {t("creator_dashboard.coupons.title", "Your coupon codes")}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t(
              "creator_dashboard.coupons.subtitle",
              "Review status, validity, and performance for every code assigned to you."
            )}
          </p>
        </header>
        {couponSummary.coupons.length === 0 ? (
          <div className="px-6 py-10 text-center text-muted-foreground text-sm">
            {t(
              "creator_dashboard.coupons.empty",
              "No coupons are assigned to you yet. Once an admin shares a code, it will appear here."
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">
                    {t("creator_dashboard.table.code", "Code")}
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    {t("creator_dashboard.table.discount", "Discount")}
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    {t("creator_dashboard.table.validity", "Validity")}
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    {t("creator_dashboard.table.status", "Status")}
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    {t("creator_dashboard.table.usage", "Usage")}
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    {t("creator_dashboard.table.reward", "Reward")}
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    {t("creator_dashboard.table.reward", "Reward")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {couponSummary.coupons.map((coupon) => {
                  const validFromLabel = coupon.validFrom
                    ? dateFormatter.format(coupon.validFrom)
                    : "—";
                  const validToLabel = coupon.validTo
                    ? dateFormatter.format(coupon.validTo)
                    : t("creator_dashboard.table.no_end", "No end date");
                  const now = Date.now();
                  const isExpired = Boolean(
                    coupon.validTo && coupon.validTo.getTime() < now
                  );
                  const statusLabel = isExpired
                    ? t("creator_dashboard.status.expired", "Expired")
                    : coupon.isActive
                      ? t("creator_dashboard.status.active", "Active")
                      : t("creator_dashboard.status.inactive", "Inactive");

                  return (
                    <tr className="bg-card/60" key={coupon.id}>
                      <td className="px-4 py-3 font-semibold uppercase tracking-wide">
                        {coupon.code}
                      </td>
                      <td className="px-4 py-3">
                        {coupon.discountPercentage}%
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <div>{validFromLabel}</div>
                        <div>{validToLabel}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ${
                            isExpired
                              ? "bg-rose-100 text-rose-700"
                              : coupon.isActive
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {coupon.usageCount.toLocaleString("en-IN")}
                        {coupon.lastRedemptionAt ? (
                          <p className="text-muted-foreground text-xs">
                            {t("creator_dashboard.table.last_used", "Last: {date}").replace(
                              "{date}",
                              dateFormatter.format(coupon.lastRedemptionAt)
                            )}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {coupon.usageCount > 0 ? (
                          <div className="flex flex-col gap-1">
                            <span>
                              {coupon.creatorRewardPercentage}% •{" "}
                              {currencyFormatter.format(coupon.estimatedRewardInPaise / 100)}
                            </span>
                            <span
                              className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                coupon.creatorRewardStatus === "paid"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {coupon.creatorRewardStatus === "paid"
                                ? t("coupon.reward_status.paid", "Paid")
                                : t("coupon.reward_status.pending", "Payment pending")}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            {t("coupon.reward_status.none", "No redemptions yet")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span>{coupon.creatorRewardPercentage}%</span>
                          <span className="text-muted-foreground text-xs">
                            {currencyFormatter.format(coupon.estimatedRewardInPaise / 100)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border bg-card/70 p-4 shadow-sm">
      <p className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
