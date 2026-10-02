import { ArrowDownLeft, ChevronDown, ChevronLeft, ChevronRight, Receipt, Wallet } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BackToHomeButton } from "@/app/(chat)/profile/back-to-home-button";
import { CreatorReferrals } from "@/components/creator-referrals";
import { EditableTranslation } from "@/components/translation-edit-provider";
import {
  getCreatorCouponRedemptions,
  getCreatorCouponSummary,
} from "@/lib/db/queries";
import { getTranslationBundle } from "@/lib/i18n/dictionary";
import { REFERRAL_COPY } from "@/lib/referrals/copy";
import { combineCreatorRewards, formatCreatorRewards } from "@/lib/referrals/creator-summary";
import { getCreatorReferralTotals } from "@/lib/referrals/service";
import { withTimeout } from "@/lib/utils/async";
import { getChatRouteSession } from "../chat-route-session";

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
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CreatorDashboardPage({
  searchParams,
}: DashboardPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const session = await getChatRouteSession();

  if (!session?.user) {
    redirect("/login?callbackUrl=/creator-dashboard");
  }

  if (session.user.role !== "creator") {
    redirect("/");
  }

  const rawSortParam =
    typeof resolvedSearchParams.sort === "string"
      ? resolvedSearchParams.sort
      : Array.isArray(resolvedSearchParams.sort)
        ? resolvedSearchParams.sort[0]
        : undefined;
  const sortKey =
    (rawSortParam as SortKey) && SORT_CONFIG[rawSortParam as SortKey]
      ? (rawSortParam as SortKey)
      : DEFAULT_SORT_KEY;
  const sortConfig = SORT_CONFIG[sortKey];

  const rawPageParam =
    typeof resolvedSearchParams.page === "string"
      ? Number.parseInt(resolvedSearchParams.page, 10)
      : Array.isArray(resolvedSearchParams.page)
        ? Number.parseInt(resolvedSearchParams.page[0] ?? "", 10)
        : Number.NaN;
  const currentPage =
    Number.isFinite(rawPageParam) && rawPageParam > 0 ? rawPageParam : 1;

  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const [bundle, couponReads, referralTotals] = await Promise.all([
    getTranslationBundle(preferredLanguage),
    Promise.allSettled([
    withTimeout(getCreatorCouponSummary(session.user.id), 7000),
    withTimeout(getCreatorCouponRedemptions({
      creatorId: session.user.id,
      page: currentPage,
      pageSize: PAGE_SIZE,
      sortBy: sortConfig.sortBy,
      sortDirection: sortConfig.sortDirection,
    }), 7000),
    ]),
    withTimeout(getCreatorReferralTotals(session.user.id), 7000).catch(() => {
      console.warn("[creator-dashboard] Referral earnings totals unavailable.");
      return null;
    }),
  ]);
  const summaryFailed = couponReads[0].status === "rejected";
  const redemptionsFailed = couponReads[1].status === "rejected";
  const summary = couponReads[0].status === "fulfilled" ? couponReads[0].value : null;
  const redemptionResult = couponReads[1].status === "fulfilled" ? couponReads[1].value : { redemptions: [], page: currentPage, pageSize: PAGE_SIZE, totalCount: 0 };
  if (summaryFailed || redemptionsFailed) console.warn("[creator-dashboard] Optional coupon section unavailable.", { summaryFailed, redemptionsFailed });
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
      totalPaidInPaise: 0,
      remainingRewardInPaise: 0,
    },
  };

  const rewardBalances = combineCreatorRewards(referralTotals, summaryFailed ? null : couponSummary.totals);
  const hasRedemptions = redemptionResult.redemptions.length > 0;
  const totalPages =
    redemptionResult.pageSize > 0
      ? Math.max(
          1,
          Math.ceil(redemptionResult.totalCount / redemptionResult.pageSize)
        )
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

  const sortOptions = [
    ["date_desc", "newest", "Newest"],
    ["date_asc", "oldest", "Oldest"],
    ["amount_desc", "highest", "Highest payment"],
    ["amount_asc", "lowest", "Lowest payment"],
  ] as const;
  const activeSort = sortOptions.find(option => option[0] === sortKey) ?? sortOptions[0];
  const hasCoupons = couponSummary.coupons.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6 sm:px-8 sm:py-10">
      <BackToHomeButton label={t("navigation.back_to_home", "Back to home")} />
      <header className="space-y-1.5">
        <p className="text-muted-foreground text-xs"><Copy name="dashboard_label" /></p>
        <h1 className="font-bold text-3xl tracking-tight"><Copy name="dashboard_heading" /></h1>
        <p className="text-muted-foreground text-sm"><Copy name="mobile_dashboard_description" /></p>
      </header>
      <section aria-labelledby="earnings-overview" className="space-y-4 rounded-3xl bg-muted p-6 text-foreground sm:p-8">
        <div className="flex items-center justify-between gap-3"><h2 id="earnings-overview" className="text-muted-foreground text-sm"><Text translationKey="creator_dashboard.metrics.rewards" defaultText="Your rewards" /></h2><Wallet className="size-5" /></div>
        <p className="break-words font-bold text-4xl tracking-tight sm:text-5xl">{formatCreatorRewards(rewardBalances, "earned")}</p>
        <dl className="grid grid-cols-2 gap-4 border-t pt-5"><div><dt className="text-muted-foreground text-xs"><Text translationKey="creator_dashboard.metrics.paid" defaultText="Payouts completed" /></dt><dd className="mt-2 break-words font-semibold text-lg">{formatCreatorRewards(rewardBalances, "paid")}</dd></div><div><dt className="text-muted-foreground text-xs"><Text translationKey="creator_dashboard.metrics.pending_payout" defaultText="Pending payout" /></dt><dd className="mt-2 break-words font-semibold text-lg">{formatCreatorRewards(rewardBalances, "remaining")}</dd></div></dl>
        <div className="flex items-center gap-2 rounded-xl bg-card p-3 text-xs"><ArrowDownLeft className="size-4" /><span className="flex-1"><Text translationKey="creator_dashboard.metrics.redemptions" defaultText="Total redemptions" /></span><span className="font-semibold">{summaryFailed ? "—" : couponSummary.totals.usageCount.toLocaleString("en-IN")}</span></div>
        {!rewardBalances ? <p className="text-muted-foreground text-sm" role="alert"><Copy name="earnings_unavailable" /></p> : null}
      </section>
      <CreatorReferrals />
      {summaryFailed || hasCoupons ? <section className="space-y-4 rounded-3xl border bg-card p-5 sm:p-6">
        <h2 className="font-semibold text-xl tracking-tight"><Text translationKey="creator_dashboard.coupons.title" defaultText="Your coupon codes" /></h2>
        {summaryFailed ? <p className="text-muted-foreground text-sm" role="alert"><Copy name="coupons_unavailable" /></p> : <div className="grid gap-4 sm:grid-cols-2">{couponSummary.coupons.map(coupon => {
          const validTo = formatDateSafe(coupon.validTo);
          const status = coupon.validTo && new Date(coupon.validTo).getTime() < Date.now() ? "expired" : coupon.isActive ? "active" : "inactive";
          return <article key={coupon.id} className="space-y-4 rounded-2xl bg-muted p-4">
            <div className="flex items-center justify-between gap-3"><h3 className="break-all font-semibold tracking-wide">{coupon.code}</h3><span className={`text-xs ${status === "active" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}><Copy name={status} /></span></div>
            <dl className="space-y-2 text-sm">
              <Row label={<Text translationKey="creator_dashboard.table.discount" defaultText="Discount" />} value={`${coupon.discountPercentage}%`} />
              <Row label={<Text translationKey="creator_dashboard.table.usage" defaultText="Usage" />} value={coupon.usageCount.toLocaleString("en-IN")} />
              <Row label={<Text translationKey="creator_dashboard.table.validity" defaultText="Validity" />} value={<>{formatDateSafe(coupon.validFrom) ?? "—"} · {validTo ?? <Text translationKey="creator_dashboard.table.no_end" defaultText="No end date" />}</>} />
              <Row label={<Text translationKey="creator_dashboard.table.reward" defaultText="Reward" />} value={`${coupon.creatorRewardPercentage}% · ${currencyFormatter.format(coupon.estimatedRewardInPaise / 100)}`} />
              <Row label={<Text translationKey="creator_dashboard.metrics.paid" defaultText="Payouts completed" />} value={currencyFormatter.format(coupon.paidRewardInPaise / 100)} />
              <Row label={<Text translationKey="creator_dashboard.metrics.pending_payout" defaultText="Pending payout" />} value={currencyFormatter.format(coupon.remainingRewardInPaise / 100)} />
            </dl>
          </article>;
        })}</div>}
      </section> : null}
      {redemptionsFailed || hasCoupons || hasRedemptions ? <section className="space-y-4 rounded-3xl border bg-card p-5 sm:p-6">
        <h2 className="font-semibold text-xl tracking-tight"><Text translationKey="creator_dashboard.redemptions.title" defaultText="Recent redemptions" /></h2>
        {redemptionsFailed ? <p className="text-muted-foreground text-sm" role="alert"><Copy name="coupons_unavailable" /></p> : hasRedemptions ? <>
          <details className="group relative w-fit"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl bg-muted px-3 text-xs"><Text translationKey={`creator_dashboard.redemptions.sort.${activeSort[1]}`} defaultText={activeSort[2]} /><ChevronDown className="size-4" /></summary><div className="absolute top-full z-10 mt-2 min-w-44 rounded-2xl border bg-popover p-2 shadow-md">{sortOptions.map(([key, label, fallback]) => <Link key={key} aria-current={key === sortKey ? "true" : undefined} className={`flex min-h-11 cursor-pointer items-center rounded-xl px-3 text-sm hover:bg-muted ${key === sortKey ? "bg-muted font-semibold" : ""}`} href={makeHref({ sortKey: key, page: 1 })} data-nav><Text translationKey={`creator_dashboard.redemptions.sort.${label}`} defaultText={fallback} /></Link>)}</div></details>
          <div className="divide-y">{redemptionResult.redemptions.map(entry => <article key={entry.id} className="space-y-2 py-4 first:pt-0">
            <div className="flex items-start justify-between gap-3 font-semibold text-sm"><p className="min-w-0 break-words">{entry.userLabel}</p><p className="shrink-0">{currencyFormatter.format(entry.paymentAmountInPaise / 100)}</p></div>
            <div className="flex justify-between gap-3 text-muted-foreground text-xs"><span>{entry.couponCode}</span><span><Text translationKey="creator_dashboard.table.reward" defaultText="Reward" /> · {currencyFormatter.format(entry.rewardInPaise / 100)}</span></div>
            <p className="text-muted-foreground text-xs">{formatDateSafe(entry.createdAt) ?? "—"}</p>
          </article>)}</div>
          {totalPages > 1 ? <nav className="flex items-center justify-center gap-3 text-sm">
            {hasPrev ? <Link className="flex min-h-11 cursor-pointer items-center gap-1 rounded-xl px-3 hover:bg-muted" href={makeHref({ page: redemptionResult.page - 1 })} data-nav><ChevronLeft className="size-4" /><Copy name="previous" /></Link> : <span aria-disabled="true" className="flex min-h-11 items-center gap-1 px-3 opacity-40"><ChevronLeft className="size-4" /><Copy name="previous" /></span>}
            <span className="text-muted-foreground">{redemptionResult.page} / {totalPages}</span>
            {hasNext ? <Link className="flex min-h-11 cursor-pointer items-center gap-1 rounded-xl px-3 hover:bg-muted" href={makeHref({ page: redemptionResult.page + 1 })} data-nav><Copy name="next" /><ChevronRight className="size-4" /></Link> : <span aria-disabled="true" className="flex min-h-11 items-center gap-1 px-3 opacity-40"><Copy name="next" /><ChevronRight className="size-4" /></span>}
          </nav> : null}
        </> : <div className="flex flex-col items-center gap-3 py-5 text-center text-muted-foreground text-sm"><Receipt className="size-6" /><Text translationKey="creator_dashboard.redemptions.empty" defaultText="No redemptions are recorded yet." /></div>}
      </section> : null}
    </div>
  );
}

function Copy({ name }: { name: keyof typeof REFERRAL_COPY }) {
  return <Text translationKey={`referrals.${name}`} defaultText={REFERRAL_COPY[name]} />;
}
function Text({ translationKey, defaultText }: { translationKey: string; defaultText: string }) {
  return <EditableTranslation translationKey={translationKey} defaultText={defaultText} />;
}
function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium">{value}</dd></div>;
}
