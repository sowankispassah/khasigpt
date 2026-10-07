import { format } from "date-fns";
import {
  CalendarRange,
  Coins,
  type LucideIcon,
  ReceiptText,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  AdminEmptyState,
  AdminPanel,
  AdminStatCard,
  AdminStatusPill,
} from "@/components/admin/admin-ui";
import { InlineExpandableRows } from "@/components/admin/inline-expandable-rows";
import { ReceiptDownloadButton } from "@/components/receipt-download-button";
import { Button } from "@/components/ui/button";
import {
  type AdminQueryResult,
  getAdminQueryTimeoutMs,
} from "@/lib/admin/safe-query";
import { normalizeMarkupMultiplier } from "@/lib/billing/cost-plus";
import { TOKENS_PER_CREDIT } from "@/lib/constants";
import type {
  getAdminApiCostBreakdown,
  getPartnerPayoutTotals,
  listChatFinancialSummaries,
  listPaidRechargeTotals,
  listRechargeRecords,
} from "@/lib/db/queries";
import type { ModelConfig } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import {
  buildCostBuckets,
  CostShareBars,
  type CostShareItem,
  DailyCostChart,
} from "./account-charts";
import {
  createMoney,
  type DisplayCurrency,
  formatCount,
  formatPercent,
  type Money,
} from "./account-format";
import { RechargeExportButton } from "./recharge-export-button";
import { ExportButton } from "./transaction-export-button";

export const PAGE_PATH = "/admin/account";

export type SearchParams = {
  from?: string;
  to?: string;
  currency?: string;
  page?: string;
  pageSize?: string;
  rechargePage?: string;
};

export type ChatSummariesResult = Awaited<ReturnType<typeof listChatFinancialSummaries>>;
export type RechargeSummariesResult = Awaited<ReturnType<typeof listPaidRechargeTotals>>;
export type PartnerPayoutsResult = Awaited<ReturnType<typeof getPartnerPayoutTotals>>;
export type RechargeRecordsResult = Awaited<ReturnType<typeof listRechargeRecords>>;
export type CostBreakdownResult = Awaited<ReturnType<typeof getAdminApiCostBreakdown>>;

export type RateQueryResult = AdminQueryResult<number>;
export type ChatSummariesQueryResult = AdminQueryResult<ChatSummariesResult>;
export type RechargeSummariesQueryResult = AdminQueryResult<RechargeSummariesResult>;
export type PartnerPayoutsQueryResult = AdminQueryResult<PartnerPayoutsResult>;
export type RechargeRecordsQueryResult = AdminQueryResult<RechargeRecordsResult>;
export type CostBreakdownQueryResult = AdminQueryResult<CostBreakdownResult>;
export type ModelConfigsQueryResult = AdminQueryResult<ModelConfig[]>;

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;
const PREVIEW_ROWS = 8;
export const ADMIN_ACCOUNT_QUERY_TIMEOUT_MS = getAdminQueryTimeoutMs(5000);
const RANGE_PRESETS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

export const EMPTY_CHAT_SUMMARIES: ChatSummariesResult = {
  total: 0,
  totals: {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    creditUnits: 0,
    userChargeInr: 0,
    providerCostUsd: 0,
  },
  records: [],
};

export const EMPTY_PARTNER_PAYOUTS: PartnerPayoutsResult = {
  couponRewardsInr: 0,
  referralCommissionsInr: 0,
};

export const EMPTY_RECHARGE_RECORDS: RechargeRecordsResult = {
  total: 0,
  records: [],
};

export const EMPTY_COST_BREAKDOWN: CostBreakdownResult = {
  totalCostUsd: 0,
  exactCostUsd: 0,
  estimatedCostUsd: 0,
  featureSummaries: [],
  modelSummaries: [],
  dailySummaries: [],
  otherUsageSummaries: [],
};

// ---------------------------------------------------------------------------
// Parameters and links
// ---------------------------------------------------------------------------

export function parseDay(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoKey(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function buildHref(
  searchParams: SearchParams,
  updates: Partial<Record<keyof SearchParams, string | null>>
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...searchParams, ...updates })) {
    if (typeof value === "string" && value.length > 0) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${PAGE_PATH}?${query}` : PAGE_PATH;
}

export function describeRange(from?: Date, to?: Date) {
  if (!from && !to) return "All time";
  const label = (date: Date) => format(date, "d MMM yyyy");
  if (from && to) return `${label(from)} – ${label(to)}`;
  return from ? `Since ${label(from)}` : `Until ${label(to as Date)}`;
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

function QueryWarning({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-800 text-sm dark:text-amber-300">
      {children}
    </div>
  );
}

function SegmentLink({
  active,
  children,
  href,
}: {
  active: boolean;
  children: ReactNode;
  href: string;
}) {
  return (
    <Link
      aria-current={active ? "true" : undefined}
      className={cn(
        "cursor-pointer whitespace-nowrap rounded-md px-3 py-1.5 font-medium text-xs transition",
        active
          ? "bg-background text-foreground shadow-xs"
          : "text-muted-foreground hover:text-foreground"
      )}
      href={href}
      prefetch={false}
    >
      {children}
    </Link>
  );
}

function Th({
  align = "left",
  children,
}: {
  align?: "left" | "right" | "center";
  children: ReactNode;
}) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-4 py-2.5 font-medium",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      )}
      scope="col"
    >
      {children}
    </th>
  );
}

function DataTable({
  children,
  head,
  minWidth,
  mobile,
}: {
  children: ReactNode;
  head: ReactNode;
  minWidth: string;
  /** Phone layout; when given, the table shows from the md breakpoint up. */
  mobile?: ReactNode;
}) {
  return (
    <>
      {mobile ? (
        <ul className="divide-y divide-border/60 md:hidden">{mobile}</ul>
      ) : null}
      <div className={cn("overflow-x-auto", mobile ? "hidden md:block" : "")}>
      <table className={cn("w-full text-sm", minWidth)}>
        <thead className="border-b bg-muted/40 text-muted-foreground text-xs">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y divide-border/60">{children}</tbody>
      </table>
      </div>
    </>
  );
}

function MobileEmpty({ title }: { title: string }) {
  return (
    <li>
      <AdminEmptyState title={title} />
    </li>
  );
}

function EmptyRow({ colSpan, title, description }: { colSpan: number; title: string; description?: string }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <AdminEmptyState description={description} title={title} />
      </td>
    </tr>
  );
}

function SignedMoney({ value, money }: { value: number; money: Money }) {
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        value < 0
          ? "text-rose-700 dark:text-rose-400"
          : value > 0
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-muted-foreground"
      )}
    >
      {money.value(value)}
    </span>
  );
}

function PageLinks({
  itemLabel,
  page,
  pageSize,
  param,
  searchParams,
  total,
}: {
  itemLabel: string;
  page: number;
  pageSize: number;
  param: "page" | "rechargePage";
  searchParams: SearchParams;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages);
  const start = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const end = Math.min(current * pageSize, total);
  const link = (target: number, label: string, enabled: boolean) =>
    enabled ? (
      <Link
        className="cursor-pointer rounded-md border px-3 py-1.5 transition hover:bg-muted"
        href={buildHref(searchParams, { [param]: String(target) })}
        prefetch={false}
      >
        {label}
      </Link>
    ) : (
      <span className="rounded-md border px-3 py-1.5 text-muted-foreground/60">
        {label}
      </span>
    );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
      <span className="text-muted-foreground">
        {formatCount(start)}–{formatCount(end)} of {formatCount(total)} {itemLabel}
      </span>
      <div className="flex items-center gap-2">
        {link(current - 1, "Previous", current > 1)}
        <span className="px-1 text-muted-foreground text-xs">
          Page {current} of {totalPages}
        </span>
        {link(current + 1, "Next", current < totalPages)}
      </div>
    </div>
  );
}

export function RangeToolbar({
  currency,
  from,
  params,
  rawFrom,
  rawTo,
  to,
}: {
  currency: DisplayCurrency;
  from?: Date;
  params: SearchParams;
  rawFrom?: string;
  rawTo?: string;
  to?: Date;
}) {
  const resetPaging = { page: null, rechargePage: null } as const;
  const isAllTime = !from && !to;

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-xs lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarRange aria-hidden="true" className="ml-1 hidden size-4 text-muted-foreground sm:block" />
        <div className="inline-flex flex-wrap rounded-lg border bg-muted/40 p-0.5">
          {RANGE_PRESETS.map((preset) => {
            const presetFrom = daysAgoKey(preset.days - 1);
            return (
              <SegmentLink
                active={rawFrom === presetFrom && !rawTo}
                href={buildHref(params, { ...resetPaging, from: presetFrom, to: null })}
                key={preset.days}
              >
                {preset.label}
              </SegmentLink>
            );
          })}
          <SegmentLink
            active={isAllTime}
            href={buildHref(params, { ...resetPaging, from: null, to: null })}
          >
            All time
          </SegmentLink>
        </div>
        <form action={PAGE_PATH} className="flex flex-wrap items-center gap-2" method="get">
          {currency === "USD" ? <input name="currency" type="hidden" value="USD" /> : null}
          {params.pageSize ? <input name="pageSize" type="hidden" value={params.pageSize} /> : null}
          <label className="sr-only" htmlFor="account-from">From</label>
          <input
            className="h-8 rounded-md border bg-background px-2 text-xs"
            defaultValue={rawFrom && from ? rawFrom : ""}
            id="account-from"
            max={todayKey()}
            name="from"
            type="date"
          />
          <span className="text-muted-foreground text-xs">to</span>
          <label className="sr-only" htmlFor="account-to">To</label>
          <input
            className="h-8 rounded-md border bg-background px-2 text-xs"
            defaultValue={rawTo && to ? rawTo : ""}
            id="account-to"
            max={todayKey()}
            name="to"
            type="date"
          />
          <Button className="h-8 px-3 text-xs" data-nav size="sm" type="submit" variant="secondary">
            Apply
          </Button>
        </form>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">Show in</span>
        <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
          <SegmentLink active={currency === "INR"} href={buildHref(params, { currency: null })}>
            ₹ INR
          </SegmentLink>
          <SegmentLink active={currency === "USD"} href={buildHref(params, { currency: "USD" })}>
            $ USD
          </SegmentLink>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview: KPIs, profit statement and cost split
// ---------------------------------------------------------------------------

const FEATURE_ORDER: Record<string, number> = {
  chat_completions: 0,
  live_voice: 1,
  image_generation: 2,
  web_search: 3,
  embeddings: 4,
};

function describeFeatureUsage(feature: CostBreakdownResult["featureSummaries"][number]) {
  switch (feature.featureKey) {
    case "chat_completions":
    case "live_voice":
      return `${formatCount(feature.usageCount)} requests · ${formatCount(feature.inputTokens)} in / ${formatCount(feature.outputTokens)} out tokens`;
    case "embeddings":
      return `${formatCount(feature.indexedEntries)} knowledge entries indexed`;
    case "image_generation":
      return `${formatCount(feature.usageCount)} image requests`;
    case "web_search":
      return `${formatCount(feature.usageCount)} searches`;
    default:
      return `${formatCount(feature.usageCount)} events`;
  }
}

export async function OverviewSection({
  chatSummariesPromise,
  costBreakdownPromise,
  currency,
  partnerPayoutsPromise,
  rangeLabel,
  rechargeSummariesPromise,
  usdToInrPromise,
}: {
  chatSummariesPromise: Promise<ChatSummariesQueryResult>;
  costBreakdownPromise: Promise<CostBreakdownQueryResult>;
  currency: DisplayCurrency;
  partnerPayoutsPromise: Promise<PartnerPayoutsQueryResult>;
  rangeLabel: string;
  rechargeSummariesPromise: Promise<RechargeSummariesQueryResult>;
  usdToInrPromise: Promise<RateQueryResult>;
}) {
  const [chats, breakdown, payouts, recharges, rate] = await Promise.all([
    chatSummariesPromise,
    costBreakdownPromise,
    partnerPayoutsPromise,
    rechargeSummariesPromise,
    usdToInrPromise,
  ]);
  const money = createMoney(currency, rate.data);

  const revenueInr = chats.data.totals.userChargeInr;
  const usageCostUsd = chats.data.totals.providerCostUsd;
  const embeddingCostUsd = breakdown.data.estimatedCostUsd;
  const payoutsInr = payouts.data.couponRewardsInr + payouts.data.referralCommissionsInr;
  const rechargedInr = recharges.data.reduce((total, entry) => {
    const isUsd = entry.currency.toUpperCase() === "USD";
    return total + (isUsd ? entry.amount * rate.data : entry.amount);
  }, 0);

  const revenue = money.fromInr(revenueInr);
  const usageCost = money.fromUsd(usageCostUsd);
  const embeddingCost = money.fromUsd(embeddingCostUsd);
  const payoutsValue = money.fromInr(payoutsInr);
  const totalCost = usageCost + embeddingCost;
  const netProfit = revenue - totalCost - payoutsValue;
  const profitConfirmed = chats.ok && breakdown.ok && payouts.ok;
  const creditsSpent = chats.data.totals.creditUnits / TOKENS_PER_CREDIT;

  const shareItems: CostShareItem[] = breakdown.data.featureSummaries
    .filter((feature) => feature.totalCostUsd !== null && feature.totalCostUsd > 0)
    .sort(
      (a, b) =>
        (b.totalCostUsd ?? 0) - (a.totalCostUsd ?? 0) ||
        (FEATURE_ORDER[a.featureKey] ?? 9) - (FEATURE_ORDER[b.featureKey] ?? 9)
    )
    .map((feature) => ({
      costUsd: feature.totalCostUsd ?? 0,
      detail: describeFeatureUsage(feature),
      estimated: feature.method === "estimated",
      key: feature.featureKey,
      label: feature.featureLabel,
    }));
  const untracked = breakdown.data.otherUsageSummaries.reduce(
    (total, row) => total + row.usageCount,
    0
  );
  const anyFailed = !chats.ok || !breakdown.ok || !payouts.ok || !recharges.ok;

  return (
    <section className="flex flex-col gap-4">
      {anyFailed || !rate.ok ? (
        <QueryWarning>
          {anyFailed
            ? "Some totals could not be loaded. Missing figures show as “—” rather than zero."
            : null}
          {!rate.ok ? " Currency conversion is using the fallback exchange rate." : null}
        </QueryWarning>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard
          hint={`${formatCount(creditsSpent, 0)} paid credits spent`}
          icon={Coins}
          label="Earned revenue"
          value={chats.ok ? money.value(revenue) : null}
        />
        <KpiCard
          hint="Chat, voice, images, search and embeddings"
          icon={ReceiptText}
          label="Provider cost"
          value={chats.ok && breakdown.ok ? money.value(totalCost) : null}
        />
        <KpiCard
          hint={
            revenue <= 0
              ? "No paid usage in this range"
              : netProfit >= 0
                ? `${formatPercent((netProfit / revenue) * 100)} margin on earned revenue`
                : "Costs are higher than earned revenue"
          }
          icon={netProfit < 0 ? TrendingDown : TrendingUp}
          label="Net profit"
          value={
            profitConfirmed ? <SignedMoney money={money} value={netProfit} /> : null
          }
        />
        <KpiCard
          hint="Collected after coupons, spent or not"
          icon={Wallet}
          label="Cash recharged"
          value={recharges.ok ? money.inr(rechargedInr) : null}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <AdminPanel
          className="min-w-0 xl:col-span-2"
          description={rangeLabel}
          title="Profit and loss"
        >
          <dl className="divide-y divide-border/60 text-sm">
            <StatementRow
              hint="Paid credits users spent, at the price they paid"
              label="Earned revenue"
              value={chats.ok ? money.value(revenue) : "—"}
            />
            <StatementRow
              hint="Chat, live voice, images and web search"
              label="Provider usage cost"
              value={chats.ok ? money.value(asDeduction(usageCost)) : "—"}
            />
            <StatementRow
              hint="Estimated from indexed knowledge size"
              label="Embeddings"
              value={breakdown.ok ? money.value(asDeduction(embeddingCost)) : "—"}
            />
            <StatementRow
              hint={
                payouts.ok
                  ? `Coupon rewards ${money.inr(payouts.data.couponRewardsInr)} · referrals ${money.inr(payouts.data.referralCommissionsInr)}`
                  : "Coupon rewards and referral commissions"
              }
              label="Creator payouts"
              value={payouts.ok ? money.value(asDeduction(payoutsValue)) : "—"}
            />
            <div className="flex items-center justify-between gap-4 bg-muted/30 px-5 py-4">
              <dt className="font-semibold">Net profit</dt>
              <dd className="text-lg">
                {profitConfirmed ? <SignedMoney money={money} value={netProfit} /> : "—"}
              </dd>
            </div>
          </dl>
          <p className="border-t px-5 py-3 text-muted-foreground text-xs leading-relaxed">
            Free and admin-granted credits earn nothing, but their provider
            cost still counts. Unspent recharge balances are not revenue until
            used. Payment gateway and app store fees are not included.
          </p>
        </AdminPanel>

        <AdminPanel
          bodyClassName="p-5"
          className="min-w-0 xl:col-span-3"
          description="Share of provider spend by feature"
          title="Where the cost goes"
        >
          {!breakdown.ok ? (
            <AdminEmptyState title="Cost breakdown could not be loaded" />
          ) : shareItems.length === 0 ? (
            <AdminEmptyState title="No provider cost in this range" />
          ) : (
            <CostShareBars items={shareItems} money={money} />
          )}
          {untracked > 0 ? (
            <p className="mt-4 text-muted-foreground text-xs">
              {formatCount(untracked)} older usage records have no model or
              saved cost, so they are not included.
            </p>
          ) : null}
        </AdminPanel>
      </div>
    </section>
  );
}

/** Shows a cost as a deduction without printing "-0.00" for zero. */
function asDeduction(value: number) {
  return value === 0 ? 0 : -value;
}

function KpiCard({
  hint,
  icon,
  label,
  value,
}: {
  hint: string;
  icon: LucideIcon;
  label: string;
  value: ReactNode | null;
}) {
  return <AdminStatCard hint={hint} icon={icon} label={label} value={value} />;
}

function StatementRow({
  hint,
  label,
  value,
}: {
  hint: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3">
      <dt className="min-w-0">
        <span className="font-medium">{label}</span>
        <span className="mt-0.5 block text-muted-foreground text-xs">{hint}</span>
      </dt>
      <dd className="shrink-0 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cost trend and cost by model
// ---------------------------------------------------------------------------

export async function CostTrendSection({
  costBreakdownPromise,
  currency,
  usdToInrPromise,
}: {
  costBreakdownPromise: Promise<CostBreakdownQueryResult>;
  currency: DisplayCurrency;
  usdToInrPromise: Promise<RateQueryResult>;
}) {
  const [breakdown, rate] = await Promise.all([costBreakdownPromise, usdToInrPromise]);
  const money = createMoney(currency, rate.data);
  const { buckets, unit } = buildCostBuckets(breakdown.data.dailySummaries);
  const dailyRows = [...breakdown.data.dailySummaries].sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  const models = breakdown.data.modelSummaries.filter(
    (row) => row.totalCostUsd !== null && row.totalCostUsd > 0
  );
  const modelTotal = models.reduce((total, row) => total + (row.totalCostUsd ?? 0), 0);

  const renderModelRow = (row: (typeof models)[number]) => (
    <tr className="transition hover:bg-muted/30" key={row.modelKey}>
      <td className="px-4 py-3">
        <div className="font-medium">{row.modelLabel}</div>
        {row.providerLabel ? (
          <div className="text-muted-foreground text-xs">{row.providerLabel}</div>
        ) : null}
      </td>
      <td className="px-4 py-3">
        <AdminStatusPill>{row.featureLabel}</AdminStatusPill>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {formatCount(row.usageCount)}
        {row.featureKey === "embeddings" ? " entries" : ""}
      </td>
      <td className="px-4 py-3 text-right font-medium tabular-nums">
        {money.usd(row.totalCostUsd ?? 0)}
        {row.method === "estimated" ? (
          <span className="block font-normal text-muted-foreground text-xs">estimated</span>
        ) : null}
      </td>
      <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
        {formatPercent(modelTotal > 0 ? ((row.totalCostUsd ?? 0) / modelTotal) * 100 : 0)}
      </td>
    </tr>
  );

  const renderModelItem = (row: (typeof models)[number]) => (
    <li className="flex items-start justify-between gap-3 px-4 py-3" key={row.modelKey}>
      <div className="min-w-0">
        <div className="truncate font-medium text-sm">{row.modelLabel}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
          <AdminStatusPill>{row.featureLabel}</AdminStatusPill>
          <span>{formatCount(row.usageCount)} uses</span>
        </div>
      </div>
      <div className="shrink-0 text-right text-sm tabular-nums">
        <div className="font-medium">{money.usd(row.totalCostUsd ?? 0)}</div>
        <div className="text-muted-foreground text-xs">
          {formatPercent(modelTotal > 0 ? ((row.totalCostUsd ?? 0) / modelTotal) * 100 : 0)}
          {row.method === "estimated" ? " · estimated" : ""}
        </div>
      </div>
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      <AdminPanel
        bodyClassName="p-5"
        description={
          unit === "week"
            ? "Provider cost per week. Hover a column for the breakdown."
            : "Provider cost per day. Hover a column for the breakdown."
        }
        title={unit === "week" ? "Weekly cost" : "Daily cost"}
      >
        {!breakdown.ok ? (
          <AdminEmptyState title="Cost trend could not be loaded" />
        ) : buckets.length === 0 ? (
          <AdminEmptyState title="No provider cost in this range" />
        ) : (
          <>
            <DailyCostChart buckets={buckets} money={money} />
            <details className="group mt-4 rounded-lg border">
              <summary className="cursor-pointer list-none px-3 py-2 text-muted-foreground text-xs transition hover:text-foreground [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Show as table</span>
                <span className="hidden group-open:inline">Hide table</span>
              </summary>
              <div className="max-h-80 overflow-auto border-t">
                <table className="w-full min-w-[640px] text-xs">
                  <thead className="sticky top-0 bg-muted text-muted-foreground">
                    <tr>
                      <Th>Date</Th>
                      <Th align="right">Chat</Th>
                      <Th align="right">Live voice</Th>
                      <Th align="right">Images</Th>
                      <Th align="right">Web search</Th>
                      <Th align="right">Embeddings</Th>
                      <Th align="right">Total</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 tabular-nums">
                    {dailyRows.map((row) => (
                      <tr key={row.date}>
                        <td className="px-4 py-2">{row.date}</td>
                        <td className="px-4 py-2 text-right">{money.usd(row.chatCostUsd)}</td>
                        <td className="px-4 py-2 text-right">{money.usd(row.liveVoiceCostUsd)}</td>
                        <td className="px-4 py-2 text-right">{money.usd(row.imageCostUsd)}</td>
                        <td className="px-4 py-2 text-right">{money.usd(row.webSearchCostUsd)}</td>
                        <td className="px-4 py-2 text-right">{money.usd(row.embeddingCostUsd)}</td>
                        <td className="px-4 py-2 text-right font-medium">{money.usd(row.totalCostUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </AdminPanel>

      <AdminPanel
        description="Which models and providers the money went to"
        title="Cost by model"
      >
        <DataTable
          head={
            <>
              <Th>Model</Th>
              <Th>Feature</Th>
              <Th align="right">Uses</Th>
              <Th align="right">Cost</Th>
              <Th align="right">Share</Th>
            </>
          }
          minWidth="min-w-[640px]"
          mobile={
            !breakdown.ok ? (
              <MobileEmpty title="Model costs could not be loaded" />
            ) : models.length === 0 ? (
              <MobileEmpty title="No model cost in this range" />
            ) : (
              models.map(renderModelItem)
            )
          }
        >
          {!breakdown.ok ? (
            <EmptyRow colSpan={5} title="Model costs could not be loaded" />
          ) : models.length === 0 ? (
            <EmptyRow colSpan={5} title="No model cost in this range" />
          ) : (
            <InlineExpandableRows
              colSpan={5}
              overflowRows={models.slice(PREVIEW_ROWS).map(renderModelRow)}
              previewRows={models.slice(0, PREVIEW_ROWS).map(renderModelRow)}
            />
          )}
        </DataTable>
      </AdminPanel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat profit log
// ---------------------------------------------------------------------------

export async function ChatProfitSection({
  chatSummariesPromise,
  currency,
  page,
  pageSize,
  params,
  usdToInrPromise,
}: {
  chatSummariesPromise: Promise<ChatSummariesQueryResult>;
  currency: DisplayCurrency;
  page: number;
  pageSize: number;
  params: SearchParams;
  usdToInrPromise: Promise<RateQueryResult>;
}) {
  const [chats, rate] = await Promise.all([chatSummariesPromise, usdToInrPromise]);
  const money = createMoney(currency, rate.data);
  const rows = chats.data.records.map((record) => {
    const providerCostInr = record.providerCostUsd * rate.data;
    return {
      chatId: record.chatId,
      createdAt: record.chatCreatedAt ?? record.usageStartedAt ?? null,
      credits: record.creditUnits / TOKENS_PER_CREDIT,
      inputTokens: record.totalInputTokens,
      outputTokens: record.totalOutputTokens,
      providerCostInr,
      providerCostUsd: record.providerCostUsd,
      revenueInr: record.userChargeInr,
      userEmail: record.email ?? "Unknown user",
    };
  });
  const exportRows = rows.map((row) => ({
    chargeInr: row.revenueInr,
    chargeUsd: rate.data > 0 ? row.revenueInr / rate.data : 0,
    chatId: row.chatId,
    createdAt: row.createdAt ? format(row.createdAt, "yyyy-MM-dd HH:mm:ss") : "",
    credits: row.credits,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    profitInr: row.revenueInr - row.providerCostInr,
    providerCostInr: row.providerCostInr,
    providerCostUsd: row.providerCostUsd,
    userEmail: row.userEmail,
  }));

  const renderRow = (row: (typeof rows)[number]) => {
    const revenue = money.fromInr(row.revenueInr);
    const cost = money.fromUsd(row.providerCostUsd);
    return (
      <tr className="transition hover:bg-muted/30" key={row.chatId}>
        <td className="max-w-[280px] px-4 py-3">
          <div className="truncate font-medium">{row.userEmail}</div>
          <div className="text-muted-foreground text-xs">
            {row.createdAt ? format(row.createdAt, "d MMM yyyy, HH:mm") : "Unknown date"}
            <span className="mx-1.5">·</span>
            <span className="font-mono">{row.chatId.slice(0, 8)}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-right text-muted-foreground text-xs tabular-nums">
          {formatCount(row.inputTokens)} / {formatCount(row.outputTokens)}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">
          {row.credits > 0 ? formatCount(row.credits, 2) : <span className="text-muted-foreground">—</span>}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">
          {revenue > 0 ? (
            money.value(revenue)
          ) : (
            <AdminStatusPill>{row.credits > 0 ? "Granted credits" : "Free"}</AdminStatusPill>
          )}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">{money.value(cost)}</td>
        <td className="px-4 py-3 text-right">
          <SignedMoney money={money} value={revenue - cost} />
        </td>
      </tr>
    );
  };

  const renderItem = (row: (typeof rows)[number]) => {
    const revenue = money.fromInr(row.revenueInr);
    const cost = money.fromUsd(row.providerCostUsd);
    return (
      <li className="flex items-start justify-between gap-3 px-4 py-3" key={row.chatId}>
        <div className="min-w-0">
          <div className="truncate font-medium text-sm">{row.userEmail}</div>
          <div className="text-muted-foreground text-xs">
            {row.createdAt ? format(row.createdAt, "d MMM, HH:mm") : "Unknown date"}
            <span className="mx-1">·</span>
            {formatCount(row.inputTokens + row.outputTokens)} tokens
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            {revenue > 0 ? (
              <span className="tabular-nums">Revenue {money.value(revenue)}</span>
            ) : (
              <AdminStatusPill>{row.credits > 0 ? "Granted credits" : "Free"}</AdminStatusPill>
            )}
            <span className="text-muted-foreground tabular-nums">Cost {money.value(cost)}</span>
          </div>
        </div>
        <div className="shrink-0 text-right text-sm">
          <SignedMoney money={money} value={revenue - cost} />
          <div className="text-muted-foreground text-xs">profit</div>
        </div>
      </li>
    );
  };

  return (
    <AdminPanel
      action={<ExportButton rows={exportRows} />}
      description="Revenue, provider cost and profit for each conversation, newest first"
      title="Chat profit log"
    >
      {!chats.ok ? (
        <div className="px-5 pt-4">
          <QueryWarning>Chat usage could not be loaded for this range.</QueryWarning>
        </div>
      ) : null}
      <DataTable
        head={
          <>
            <Th>Chat</Th>
            <Th align="right">Tokens in / out</Th>
            <Th align="right">Credits</Th>
            <Th align="right">Revenue</Th>
            <Th align="right">Provider cost</Th>
            <Th align="right">Profit</Th>
          </>
        }
        minWidth="min-w-[760px]"
        mobile={
          rows.length === 0 ? (
            <MobileEmpty
              title={chats.ok ? "No chat usage in this range" : "Chat usage unavailable"}
            />
          ) : (
            rows.map(renderItem)
          )
        }
      >
        {rows.length === 0 ? (
          <EmptyRow
            colSpan={6}
            description={chats.ok ? "Try a wider date range." : undefined}
            title={chats.ok ? "No chat usage in this range" : "Chat usage unavailable"}
          />
        ) : (
          <InlineExpandableRows
            colSpan={6}
            overflowRows={rows.slice(PREVIEW_ROWS).map(renderRow)}
            previewRows={rows.slice(0, PREVIEW_ROWS).map(renderRow)}
          />
        )}
      </DataTable>
      {chats.ok && chats.data.total > 0 ? (
        <PageLinks
          itemLabel="chats"
          page={page}
          pageSize={pageSize}
          param="page"
          searchParams={params}
          total={chats.data.total}
        />
      ) : null}
    </AdminPanel>
  );
}

// ---------------------------------------------------------------------------
// Recharges
// ---------------------------------------------------------------------------

export async function RechargeSection({
  currency,
  page,
  pageSize,
  params,
  rechargeRecordsPromise,
  usdToInrPromise,
}: {
  currency: DisplayCurrency;
  page: number;
  pageSize: number;
  params: SearchParams;
  rechargeRecordsPromise: Promise<RechargeRecordsQueryResult>;
  usdToInrPromise: Promise<RateQueryResult>;
}) {
  const [recharges, rate] = await Promise.all([rechargeRecordsPromise, usdToInrPromise]);
  const money = createMoney(currency, rate.data);
  const rows = recharges.data.records.map((record) => {
    const amount = record.amount / 100;
    const sourceCurrency = record.currency.toUpperCase();
    const amountInr = sourceCurrency === "USD" ? amount * rate.data : amount;
    return {
      amount,
      amountInr,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      orderId: record.orderId,
      planName: record.planName ?? "—",
      sourceCurrency,
      updatedAt: record.updatedAt,
      userEmail: record.email ?? "Unknown user",
    };
  });
  const exportRows = rows.map((row) => ({
    amountInr: row.amountInr,
    amountUsd: rate.data > 0 ? row.amountInr / rate.data : 0,
    createdAt: format(row.createdAt, "yyyy-MM-dd HH:mm:ss"),
    currency: row.sourceCurrency,
    expiresAt: row.expiresAt ? format(row.expiresAt, "yyyy-MM-dd HH:mm:ss") : "",
    orderId: row.orderId,
    planName: row.planName,
    updatedAt: format(row.updatedAt, "yyyy-MM-dd HH:mm:ss"),
    userEmail: row.userEmail,
  }));

  const renderRow = (row: (typeof rows)[number]) => (
    <tr className="transition hover:bg-muted/30" key={row.orderId}>
      <td className="whitespace-nowrap px-4 py-3">{format(row.createdAt, "d MMM yyyy, HH:mm")}</td>
      <td className="max-w-[260px] px-4 py-3">
        <div className="truncate font-medium">{row.userEmail}</div>
        <div className="truncate font-mono text-muted-foreground text-xs">{row.orderId}</div>
      </td>
      <td className="px-4 py-3">{row.planName}</td>
      <td className="px-4 py-3 text-right tabular-nums">
        <div className="font-medium">{money.inr(row.amountInr)}</div>
        {row.sourceCurrency !== currency ? (
          <div className="text-muted-foreground text-xs">
            paid in {row.sourceCurrency}
          </div>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
        {row.expiresAt ? format(row.expiresAt, "d MMM yyyy") : "—"}
      </td>
      <td className="px-4 py-3 text-center">
        <ReceiptDownloadButton admin orderId={row.orderId} />
      </td>
    </tr>
  );

  const renderItem = (row: (typeof rows)[number]) => (
    <li className="flex items-start justify-between gap-3 px-4 py-3" key={row.orderId}>
      <div className="min-w-0">
        <div className="truncate font-medium text-sm">{row.userEmail}</div>
        <div className="text-muted-foreground text-xs">
          {row.planName} · {format(row.createdAt, "d MMM yyyy")}
        </div>
        <div className="truncate font-mono text-muted-foreground text-xs">{row.orderId}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="font-medium text-sm tabular-nums">{money.inr(row.amountInr)}</span>
        <ReceiptDownloadButton admin orderId={row.orderId} />
      </div>
    </li>
  );

  return (
    <AdminPanel
      action={<RechargeExportButton rows={exportRows} />}
      description="Successful payments in this range"
      title="Recharges"
    >
      {!recharges.ok ? (
        <div className="px-5 pt-4">
          <QueryWarning>Recharges could not be loaded for this range.</QueryWarning>
        </div>
      ) : null}
      <DataTable
        head={
          <>
            <Th>Paid</Th>
            <Th>User / order</Th>
            <Th>Plan</Th>
            <Th align="right">Amount</Th>
            <Th>Credits expire</Th>
            <Th align="center">Receipt</Th>
          </>
        }
        minWidth="min-w-[760px]"
        mobile={
          rows.length === 0 ? (
            <MobileEmpty
              title={recharges.ok ? "No paid recharges in this range" : "Recharges unavailable"}
            />
          ) : (
            rows.map(renderItem)
          )
        }
      >
        {rows.length === 0 ? (
          <EmptyRow
            colSpan={6}
            title={recharges.ok ? "No paid recharges in this range" : "Recharges unavailable"}
          />
        ) : (
          <InlineExpandableRows
            colSpan={6}
            overflowRows={rows.slice(PREVIEW_ROWS).map(renderRow)}
            previewRows={rows.slice(0, PREVIEW_ROWS).map(renderRow)}
          />
        )}
      </DataTable>
      {recharges.ok && recharges.data.total > 0 ? (
        <PageLinks
          itemLabel="recharges"
          page={page}
          pageSize={pageSize}
          param="rechargePage"
          searchParams={params}
          total={recharges.data.total}
        />
      ) : null}
    </AdminPanel>
  );
}

// ---------------------------------------------------------------------------
// Model pricing
// ---------------------------------------------------------------------------

export async function ModelPricingSection({
  currency,
  modelConfigsPromise,
  usdToInrPromise,
}: {
  currency: DisplayCurrency;
  modelConfigsPromise: Promise<ModelConfigsQueryResult>;
  usdToInrPromise: Promise<RateQueryResult>;
}) {
  const [models, rate] = await Promise.all([modelConfigsPromise, usdToInrPromise]);
  const money = createMoney(currency, rate.data);
  // Customer price at the base recharge rate: provider cost x markup. Bonus
  // credits on larger recharge plans lower the realized price per user.
  const rows = models.data
    .map((config) => {
      const markup = normalizeMarkupMultiplier(config.markupMultiplier);
      const inputCostUsd = Math.max(0, Number(config.inputProviderCostPerMillion ?? 0));
      const outputCostUsd = Math.max(0, Number(config.outputProviderCostPerMillion ?? 0));
      return {
        enabled: config.isEnabled,
        id: config.id,
        inputCostUsd,
        marginPercent: ((markup - 1) / markup) * 100,
        markup,
        name: config.displayName,
        outputCostUsd,
        provider: config.provider,
      };
    })
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));

  const priceCell = (costUsd: number, markup: number) => (
    <td className="px-4 py-3 text-right tabular-nums">
      <div className="font-medium">{money.usd(costUsd * markup)}</div>
      <div className="text-muted-foreground text-xs">cost {money.usd(costUsd)}</div>
    </td>
  );

  const renderRow = (row: (typeof rows)[number]) => (
    <tr className={cn("transition hover:bg-muted/30", row.enabled ? "" : "opacity-60")} key={row.id}>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{row.name}</span>
          {row.enabled ? null : <AdminStatusPill>Disabled</AdminStatusPill>}
        </div>
        <div className="text-muted-foreground text-xs capitalize">{row.provider}</div>
      </td>
      <td className="px-4 py-3 text-right tabular-nums">{formatCount(row.markup, 2)}×</td>
      {priceCell(row.inputCostUsd, row.markup)}
      {priceCell(row.outputCostUsd, row.markup)}
      <td className="px-4 py-3 text-right">
        <AdminStatusPill tone={row.marginPercent > 0 ? "success" : "neutral"}>
          {formatPercent(row.marginPercent)}
        </AdminStatusPill>
      </td>
    </tr>
  );

  const renderItem = (row: (typeof rows)[number]) => (
    <li className={cn("px-4 py-3", row.enabled ? "" : "opacity-60")} key={row.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-sm">{row.name}</span>
            {row.enabled ? null : <AdminStatusPill>Disabled</AdminStatusPill>}
          </div>
          <div className="text-muted-foreground text-xs capitalize">
            {row.provider} · {formatCount(row.markup, 2)}× markup
          </div>
        </div>
        <AdminStatusPill tone={row.marginPercent > 0 ? "success" : "neutral"}>
          {formatPercent(row.marginPercent)}
        </AdminStatusPill>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs tabular-nums">
        <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
          <dt className="text-muted-foreground">Input / 1M</dt>
          <dd className="font-medium text-sm">{money.usd(row.inputCostUsd * row.markup)}</dd>
          <dd className="text-muted-foreground">cost {money.usd(row.inputCostUsd)}</dd>
        </div>
        <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
          <dt className="text-muted-foreground">Output / 1M</dt>
          <dd className="font-medium text-sm">{money.usd(row.outputCostUsd * row.markup)}</dd>
          <dd className="text-muted-foreground">cost {money.usd(row.outputCostUsd)}</dd>
        </div>
      </dl>
    </li>
  );

  return (
    <AdminPanel
      description="Customer price per 1M tokens at the base recharge rate (provider cost × markup). Bonus credits on bigger plans lower what those buyers pay."
      title="Model pricing"
    >
      {!models.ok ? (
        <div className="px-5 pt-4">
          <QueryWarning>Model pricing could not be loaded.</QueryWarning>
        </div>
      ) : null}
      <DataTable
        head={
          <>
            <Th>Model</Th>
            <Th align="right">Markup</Th>
            <Th align="right">Input / 1M</Th>
            <Th align="right">Output / 1M</Th>
            <Th align="right">Margin</Th>
          </>
        }
        minWidth="min-w-[640px]"
        mobile={
          rows.length === 0 ? (
            <MobileEmpty title={models.ok ? "No chat models configured" : "Model pricing unavailable"} />
          ) : (
            rows.map(renderItem)
          )
        }
      >
        {rows.length === 0 ? (
          <EmptyRow colSpan={5} title={models.ok ? "No chat models configured" : "Model pricing unavailable"} />
        ) : (
          <InlineExpandableRows
            colSpan={5}
            overflowRows={rows.slice(PREVIEW_ROWS).map(renderRow)}
            previewRows={rows.slice(0, PREVIEW_ROWS).map(renderRow)}
          />
        )}
      </DataTable>
    </AdminPanel>
  );
}

// ---------------------------------------------------------------------------
// Loading states
// ---------------------------------------------------------------------------

export function OverviewFallback() {
  return (
    <section aria-busy="true" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="h-[124px] animate-pulse rounded-xl border bg-card"
            key={`kpi-${index + 1}`}
          />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        <div className="h-80 animate-pulse rounded-xl border bg-card xl:col-span-2" />
        <div className="h-80 animate-pulse rounded-xl border bg-card xl:col-span-3" />
      </div>
    </section>
  );
}

export function PanelFallback({ rows, title }: { rows: number; title: string }) {
  return (
    <AdminPanel title={title}>
      <div aria-busy="true" className="space-y-3 p-5">
        {Array.from({ length: rows }, (_, index) => (
          <div className="h-10 animate-pulse rounded-lg bg-muted/50" key={`${title}-${index + 1}`} />
        ))}
      </div>
    </AdminPanel>
  );
}
