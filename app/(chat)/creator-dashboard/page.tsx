import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import { BackToHomeButton } from "@/app/(chat)/profile/back-to-home-button";
import {
  getCreatorCouponRedemptions,
  getCreatorCouponSummary,
} from "@/lib/db/queries";
import { getTranslationBundle } from "@/lib/i18n/dictionary";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});

const formatDateSafe = (date: Date | string | null | undefined) => {
  if (!date) {
    return null;
  }
  try {
    const value = typeof date === "string" ? new Date(date) : date;
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    return dateFormatter.format(value);
  } catch {
    return null;
  }
};
const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type SortKey = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
const SORT_CONFIG: Record<
  SortKey,
  { sortBy: "date" | "payment"; sortDirection: "asc" | "desc" }
> = {
  date_desc: { sortBy: "date", sortDirection: "desc" },
  date_asc: { sortBy: "date", sortDirection: "asc" },
  amount_desc: { sortBy: "payment", sortDirection: "desc" },
  amount_asc: { sortBy: "payment", sortDirection: "asc" },
};
const DEFAULT_SORT_KEY: SortKey = "date_desc";
const PAGE_SIZE = 10;

type DashboardPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function CreatorDashboardPage({ searchParams = {} }: DashboardPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/creator-dashboard");
  }

  if (session.user.role !== "creator") {
    redirect("/");
  }

  const rawSortParam =
    typeof searchParams.sort === "string"
      ? searchParams.sort
      : Array.isArray(searchParams.sort)
        ? searchParams.sort[0]
        : undefined;
  const sortKey = (rawSortParam as SortKey) && SORT_CONFIG[rawSortParam as SortKey]
    ? (rawSortParam as SortKey)
    : DEFAULT_SORT_KEY;
  const sortConfig = SORT_CONFIG[sortKey];

  const rawPageParam =
    typeof searchParams.page === "string"
      ? Number.parseInt(searchParams.page, 10)
      : Array.isArray(searchParams.page)
        ? Number.parseInt(searchParams.page[0] ?? "", 10)
        : Number.NaN;
  const currentPage = Number.isFinite(rawPageParam) && rawPageParam > 0 ? rawPageParam : 1;

  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const [bundle, summary, redemptionResult] = await Promise.all([
    getTranslationBundle(preferredLanguage),
    getCreatorCouponSummary(session.user.id),
    getCreatorCouponRedemptions({
      creatorId: session.user.id,
      page: currentPage,
      pageSize: PAGE_SIZE,
      sortBy: sortConfig.sortBy,
      sortDirection: sortConfig.sortDirection,
    }),
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
  const hasRedemptions = redemptionResult.redemptions.length > 0;
  const totalPages =
    redemptionResult.pageSize > 0
      ? Math.max(1, Math.ceil(redemptionResult.totalCount / redemptionResult.pageSize))
      : 1;
  const hasPrev = redemptionResult.page > 1;
  const hasNext = redemptionResult.page < totalPages;

  const makeHref = (overrides?: { page?: number; sortKey?: SortKey }) => {
    const params = new URLSearchParams();
    const nextSortKey = overrides?.sortKey ?? sortKey;
    if (nextSortKey !== DEFAULT_SORT_KEY) {
      params.set("sort", nextSortKey);
    }
    const nextPage = overrides?.page ?? redemptionResult.page;
    if (nextPage > 1) {
      params.set("page", String(nextPage));
    }
    const query = params.toString();
    return `/creator-dashboard${query ? `?${query}` : ""}`;
  };

  const sortOptions: Array<{ key: SortKey; label: string }> = [
    {
      key: "date_desc",
      label: t("creator_dashboard.redemptions.sort.newest", "Newest"),
    },
    {
      key: "date_asc",
      label: t("creator_dashboard.redemptions.sort.oldest", "Oldest"),
    },
    {
      key: "amount_desc",
      label: t("creator_dashboard.redemptions.sort.highest", "Highest payment"),
    },
    {
      key: "amount_asc",
      label: t("creator_dashboard.redemptions.sort.lowest", "Lowest payment"),
    },
  ];

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
                  const validFromLabel = formatDateSafe(coupon.validFrom) ?? "—";
                  const validToLabel =
                    formatDateSafe(coupon.validTo) ??
                    t("creator_dashboard.table.no_end", "No end date");
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
                              formatDateSafe(coupon.lastRedemptionAt) ?? "—"
                            )}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {coupon.usageCount > 0 ? (
                          <div className="flex flex-col gap-1">
                            <span>
                              {coupon.creatorRewardPercentage}% •{" "}
                              <span className="font-semibold">
                                {currencyFormatter.format(coupon.estimatedRewardInPaise / 100)}
                              </span>
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

      <section className="rounded-2xl border bg-card/70 shadow-sm">
        <header className="flex flex-col gap-2 border-b px-4 py-4 sm:px-6">
          <h2 className="text-lg font-semibold">
            {t("creator_dashboard.redemptions.title", "Recent redemptions")}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t(
              "creator_dashboard.redemptions.subtitle",
              "Track every subscription that used your coupon code."
            )}
          </p>
        </header>
        {hasRedemptions ? (
          <>
            <div className="flex flex-col gap-2 border-b px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">
                  {t("creator_dashboard.redemptions.sort.label", "Sort by")}
                </span>
                <div className="flex flex-wrap gap-1">
                  {sortOptions.map((option) => {
                    const isActive = option.key === sortKey;
                    return (
                      <Link
                        key={option.key}
                        href={makeHref({ sortKey: option.key, page: 1 })}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                        aria-current={isActive ? "true" : "false"}
                      >
                        {option.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <span>
                  {t("creator_dashboard.redemptions.pagination", "Page {current} of {total}")
                    .replace("{current}", redemptionResult.page.toString())
                    .replace("{total}", totalPages.toString())}
                </span>
                <div className="flex items-center gap-1">
                  <Link
                    href={hasPrev ? makeHref({ page: redemptionResult.page - 1 }) : "#"}
                    aria-disabled={!hasPrev}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      hasPrev
                        ? "hover:bg-muted"
                        : "cursor-not-allowed opacity-40"
                    }`}
                  >
                    {t("common.previous", "Previous")}
                  </Link>
                  <Link
                    href={hasNext ? makeHref({ page: redemptionResult.page + 1 }) : "#"}
                    aria-disabled={!hasNext}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      hasNext
                        ? "hover:bg-muted"
                        : "cursor-not-allowed opacity-40"
                    }`}
                  >
                    {t("common.next", "Next")}
                  </Link>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">
                      {t("creator_dashboard.redemptions.user", "User")}
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      {t("creator_dashboard.redemptions.coupon", "Coupon")}
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      {t("creator_dashboard.redemptions.payment", "Payment")}
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      {t("creator_dashboard.redemptions.discount", "Discount")}
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      {t("creator_dashboard.redemptions.reward", "Your reward")}
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      {t("creator_dashboard.redemptions.date", "Redeemed at")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {redemptionResult.redemptions.map((redemption) => (
                    <tr className="bg-card/60" key={redemption.id}>
                      <td className="px-4 py-3 font-semibold tracking-wide">
                        {redemption.userLabel}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {redemption.couponCode}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold">
                          {currencyFormatter.format(redemption.paymentAmountInPaise / 100)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {currencyFormatter.format(redemption.discountAmountInPaise / 100)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold">
                          {currencyFormatter.format(redemption.rewardInPaise / 100)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {formatDateSafe(redemption.createdAt) ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="px-6 py-10 text-center text-muted-foreground text-sm">
            {t(
              "creator_dashboard.redemptions.empty",
              "No redemptions are recorded yet. Share your code to see activity here."
            )}
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
