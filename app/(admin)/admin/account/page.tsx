import { format } from "date-fns";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { InlineExpandableRows } from "@/components/admin/inline-expandable-rows";
import { ReceiptDownloadButton } from "@/components/receipt-download-button";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import {
  type AdminQueryResult,
  adminQueryResult,
  getAdminQueryTimeoutMs,
} from "@/lib/admin/safe-query";
import { normalizeMarkupMultiplier } from "@/lib/billing/cost-plus";
import { TOKENS_PER_CREDIT } from "@/lib/constants";
import {
  type ChatFinancialSummary,
  getAdminApiCostBreakdown,
  getPartnerPayoutTotals,
  listChatFinancialSummaries,
  listModelConfigs,
  listPaidRechargeTotals,
  listRechargeRecords,
  type RechargeRecord,
} from "@/lib/db/queries";
import type { ModelConfig } from "@/lib/db/schema";
import {
  getFallbackUsdToInrRate,
  getUsdToInrRate,
} from "@/lib/services/exchange-rate";
import { cn } from "@/lib/utils";
import { RechargeExportButton } from "./recharge-export-button";
import { ExportButton } from "./transaction-export-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = {
  from?: string;
  to?: string;
  page?: string;
  pageSize?: string;
  costFrom?: string;
  costTo?: string;
  costCurrency?: string;
};

type CostCurrency = "USD" | "INR";
type ChatSummariesResult = Awaited<ReturnType<typeof listChatFinancialSummaries>>;
type RechargeSummariesResult = Awaited<ReturnType<typeof listPaidRechargeTotals>>;
type PartnerPayoutsResult = Awaited<ReturnType<typeof getPartnerPayoutTotals>>;
type RechargeRecordsResult = Awaited<ReturnType<typeof listRechargeRecords>>;
type CostBreakdownResult = Awaited<ReturnType<typeof getAdminApiCostBreakdown>>;
type RateQueryResult = AdminQueryResult<number>;
type ChatSummariesQueryResult = AdminQueryResult<ChatSummariesResult>;
type RechargeSummariesQueryResult = AdminQueryResult<RechargeSummariesResult>;
type PartnerPayoutsQueryResult = AdminQueryResult<PartnerPayoutsResult>;
type RechargeRecordsQueryResult = AdminQueryResult<RechargeRecordsResult>;
type CostBreakdownQueryResult = AdminQueryResult<CostBreakdownResult>;
type ModelConfigsQueryResult = AdminQueryResult<ModelConfig[]>;

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;
const DEFAULT_SECTION_PREVIEW_ROWS = 5;
const ADMIN_ACCOUNT_QUERY_TIMEOUT_MS = getAdminQueryTimeoutMs(5000);

const EMPTY_CHAT_SUMMARIES: ChatSummariesResult = {
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

const EMPTY_PARTNER_PAYOUTS: PartnerPayoutsResult = {
  couponRewardsInr: 0,
  referralCommissionsInr: 0,
};

const EMPTY_RECHARGE_RECORDS: RechargeRecordsResult = {
  total: 0,
  records: [],
};

const EMPTY_COST_BREAKDOWN: CostBreakdownResult = {
  totalCostUsd: 0,
  exactCostUsd: 0,
  estimatedCostUsd: 0,
  featureSummaries: [],
  modelSummaries: [],
  dailySummaries: [],
  otherUsageSummaries: [],
};

type MetricCard = {
  title: string;
  value: string;
  description?: string;
};

type ChatProfitRow = {
  chatId: string;
  userEmail: string;
  createdAt: Date | null;
  inputTokens: number;
  outputTokens: number;
  credits: number;
  chargeUsd: number;
  chargeInr: number;
  isFreeUsage: boolean;
  providerCostUsd: number;
  providerCostInr: number;
  profitInr: number;
};

type RechargeTableRow = {
  orderId: string;
  userEmail: string;
  planName: string;
  amountUsd: number;
  amountInr: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
};

type ModelPricingRow = {
  id: string;
  name: string;
  provider: string;
  markupMultiplier: number;
  userInputUsd: number;
  userOutputUsd: number;
  providerInputUsd: number;
  providerOutputUsd: number;
  profitInputUsd: number;
  profitOutputUsd: number;
  marginPercent: number;
  enabled: boolean;
};

function parseDate(value?: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseCostCurrency(value?: string): CostCurrency {
  return value === "USD" ? "USD" : "INR";
}

function formatCurrency(value: number, currency: "USD" | "INR") {
  return value.toLocaleString(currency === "USD" ? "en-US" : "en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCostInCurrency(valueUsd: number, currency: CostCurrency, usdToInr: number) {
  return formatCurrency(currency === "USD" ? valueUsd : valueUsd * usdToInr, currency);
}

function formatNumber(value: number, fractionDigits = 0) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function mapChatRows(records: ChatFinancialSummary[], usdToInr: number): ChatProfitRow[] {
  return records.map((record) => {
    const createdAt = record.chatCreatedAt ?? record.usageStartedAt ?? null;
    return {
      chatId: record.chatId ?? "(unknown)",
      userEmail: record.email ?? "Unknown user",
      createdAt,
      inputTokens: record.totalInputTokens,
      outputTokens: record.totalOutputTokens,
      credits: record.creditUnits / TOKENS_PER_CREDIT,
      chargeUsd: usdToInr > 0 ? record.userChargeInr / usdToInr : 0,
      chargeInr: record.userChargeInr,
      isFreeUsage: !record.userChargeInr || record.userChargeInr <= 0,
      providerCostUsd: record.providerCostUsd,
      providerCostInr: record.providerCostUsd * usdToInr,
      profitInr: record.userChargeInr - record.providerCostUsd * usdToInr,
    };
  });
}

function aggregateRechargeTotals(
  totals: Awaited<ReturnType<typeof listPaidRechargeTotals>>,
  usdToInr: number
) {
  let totalUsd = 0;
  let totalInr = 0;
  for (const entry of totals) {
    const currency = entry.currency.toUpperCase();
    if (currency === "USD") {
      totalUsd += entry.amount;
      totalInr += entry.amount * usdToInr;
    } else {
      totalInr += entry.amount;
      totalUsd += usdToInr > 0 ? entry.amount / usdToInr : 0;
    }
  }
  return { totalUsd, totalInr };
}

function mapRechargeRows(records: RechargeRecord[], usdToInr: number): RechargeTableRow[] {
  return records.map((record) => {
    const baseAmount = record.amount / 100;
    const currency = record.currency.toUpperCase();
    return {
      orderId: record.orderId,
      userEmail: record.email ?? "Unknown user",
      planName: record.planName ?? "-",
      amountUsd: currency === "USD" ? baseAmount : usdToInr > 0 ? baseAmount / usdToInr : 0,
      amountInr: currency === "INR" ? baseAmount : baseAmount * usdToInr,
      currency,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      expiresAt: record.expiresAt,
    };
  });
}

// Customer price at the base recharge rate: provider cost x markup. Bonus
// credits on larger recharge plans lower the realized price per user.
function mapModelPricingRows(configs: ModelConfig[]): ModelPricingRow[] {
  return configs.map((config) => {
    const providerInputUsd = Math.max(0, Number(config.inputProviderCostPerMillion ?? 0));
    const providerOutputUsd = Math.max(0, Number(config.outputProviderCostPerMillion ?? 0));
    const markupMultiplier = normalizeMarkupMultiplier(config.markupMultiplier);
    const userInputUsd = providerInputUsd * markupMultiplier;
    const userOutputUsd = providerOutputUsd * markupMultiplier;
    return {
      id: config.id,
      name: config.displayName,
      provider: config.provider,
      markupMultiplier,
      userInputUsd,
      userOutputUsd,
      providerInputUsd,
      providerOutputUsd,
      profitInputUsd: userInputUsd - providerInputUsd,
      profitOutputUsd: userOutputUsd - providerOutputUsd,
      marginPercent: ((markupMultiplier - 1) / markupMultiplier) * 100,
      enabled: config.isEnabled,
    };
  });
}

function buildSearchHref(
  searchParams: SearchParams | undefined,
  updates: Partial<Record<keyof SearchParams, string | null | undefined>>
) {
  const params = new URLSearchParams();
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (typeof value === "string" && value.length > 0) params.set(key, value);
    }
  }
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === "string" && value.length > 0) params.set(key, value);
    else params.delete(key);
  }
  const query = params.toString();
  return query ? `?${query}` : "?";
}

function PreservedSearchParamsInputs({
  searchParams,
  exclude,
}: {
  searchParams?: SearchParams;
  exclude: Array<keyof SearchParams>;
}) {
  if (!searchParams) return null;
  return (
    <>
      {Object.entries(searchParams)
        .filter(([key, value]) => typeof value === "string" && value.length > 0 && !exclude.includes(key as keyof SearchParams))
        .map(([key, value]) => (
          <input key={key} name={key} type="hidden" value={value} />
        ))}
    </>
  );
}

function splitPreviewRows<T>(rows: T[], previewSize = DEFAULT_SECTION_PREVIEW_ROWS) {
  return { preview: rows.slice(0, previewSize), overflow: rows.slice(previewSize) };
}

function AccountSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group overflow-hidden rounded-xl border bg-card shadow-xs"
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-semibold text-base transition hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180"
        />
      </summary>
      <div className="border-t p-4">{children}</div>
    </details>
  );
}

function AccountQueryWarning({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-sm">
      {children}
    </div>
  );
}

function SubsectionPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-background p-4">
      <h3 className="mb-3 font-medium text-sm">{title}</h3>
      {children}
    </section>
  );
}

function describeCostUsage(row: {
  featureKey: string;
  usageCount: number;
  inputTokens: number;
  outputTokens: number;
  indexedEntries: number;
  indexedChars: number;
}) {
  switch (row.featureKey) {
    case "chat_completions":
    case "live_voice":
      return `${formatNumber(row.usageCount)} usage rows, ${formatNumber(
        row.inputTokens
      )} in / ${formatNumber(row.outputTokens)} out`;
    case "embeddings":
      return `${formatNumber(row.indexedEntries)} indexed entries, ${formatNumber(
        row.indexedChars
      )} chars`;
    case "image_generation":
    case "web_search":
      return `${formatNumber(row.usageCount)} billed requests`;
    default:
      return `${formatNumber(row.usageCount)} events, ${formatNumber(
        row.inputTokens
      )} tokens`;
  }
}

function renderCostFeatureRow(
  row: Awaited<ReturnType<typeof getAdminApiCostBreakdown>>["featureSummaries"][number],
  currency: CostCurrency,
  usdToInr: number
) {
  const usageLabel = describeCostUsage(row);

  return (
    <tr className="border-t text-sm" key={row.featureKey}>
      <td className="py-2 font-medium">{row.featureLabel}</td>
      <td className="py-2 capitalize">{row.method.replaceAll("_", " ")}</td>
      <td className="py-2">{usageLabel}</td>
      <td className="py-2 text-right">{formatNumber(row.modelCount)}</td>
      <td className="py-2 text-right">
        {row.totalCostUsd === null
          ? "-"
          : formatCostInCurrency(row.totalCostUsd, currency, usdToInr)}
      </td>
      <td className="py-2 text-muted-foreground text-xs">{row.note ?? "-"}</td>
    </tr>
  );
}

function renderCostModelRow(
  row: Awaited<ReturnType<typeof getAdminApiCostBreakdown>>["modelSummaries"][number],
  currency: CostCurrency,
  usdToInr: number
) {
  const usageLabel = describeCostUsage(row);

  return (
    <tr className="border-t text-sm" key={row.modelKey}>
      <td className="py-2">{row.featureLabel}</td>
      <td className="py-2 font-medium">{row.modelLabel}</td>
      <td className="py-2 text-muted-foreground text-xs">
        {row.providerLabel ?? "-"}
      </td>
      <td className="py-2 capitalize">{row.method.replaceAll("_", " ")}</td>
      <td className="py-2">{usageLabel}</td>
      <td className="py-2 text-right">
        {row.totalCostUsd === null
          ? "-"
          : formatCostInCurrency(row.totalCostUsd, currency, usdToInr)}
      </td>
    </tr>
  );
}

function renderDailyCostRow(
  row: Awaited<ReturnType<typeof getAdminApiCostBreakdown>>["dailySummaries"][number],
  currency: CostCurrency,
  usdToInr: number
) {
  return (
    <tr className="border-t text-sm" key={row.date}>
      <td className="py-2">{row.date}</td>
      <td className="py-2 text-right">
        {formatCostInCurrency(row.chatCostUsd, currency, usdToInr)}
      </td>
      <td className="py-2 text-right">
        {formatCostInCurrency(row.liveVoiceCostUsd, currency, usdToInr)}
      </td>
      <td className="py-2 text-right">
        {formatCostInCurrency(row.imageCostUsd, currency, usdToInr)}
      </td>
      <td className="py-2 text-right">
        {formatCostInCurrency(row.webSearchCostUsd, currency, usdToInr)}
      </td>
      <td className="py-2 text-right">
        {formatCostInCurrency(row.embeddingCostUsd, currency, usdToInr)}
      </td>
      <td className="py-2 text-right font-medium">
        {formatCostInCurrency(row.totalCostUsd, currency, usdToInr)}
      </td>
      <td className="py-2 text-right">{formatNumber(row.otherUsageCount)}</td>
    </tr>
  );
}

function renderOtherUsageRow(
  row: Awaited<ReturnType<typeof getAdminApiCostBreakdown>>["otherUsageSummaries"][number]
) {
  return (
    <tr className="border-t text-sm" key={row.featureKey}>
      <td className="py-2 font-medium">{row.featureLabel}</td>
      <td className="py-2 text-right">{formatNumber(row.usageCount)}</td>
      <td className="py-2 text-right">{formatNumber(row.totalTokens)}</td>
      <td className="py-2 text-muted-foreground text-xs">{row.note}</td>
    </tr>
  );
}

function renderChatProfitRow(row: ChatProfitRow) {
  const dateLabel = row.createdAt ? format(row.createdAt, "PPpp") : "-";
  return (
    <tr className="border-t text-sm" key={`${row.chatId}-${dateLabel}`}>
      <td className="py-2">{dateLabel}</td>
      <td className="py-2 font-mono text-xs">{row.chatId.slice(0, 12)}</td>
      <td className="py-2">{row.userEmail}</td>
      <td className="py-2 text-right">
        <div className="flex flex-col items-end">
          <span>{formatNumber(row.credits, 2)}</span>
          <span className="text-muted-foreground text-xs">
            ({formatNumber(row.inputTokens)} in / {formatNumber(row.outputTokens)} out)
          </span>
        </div>
      </td>
      <td className="py-2 text-right">
        {row.isFreeUsage ? (
          <span className="font-medium text-muted-foreground text-xs">
            Free credits
          </span>
        ) : (
          <div className="flex flex-col items-end">
            <span>{formatCurrency(row.chargeInr, "INR")}</span>
            <span className="text-muted-foreground text-xs">
              {formatCurrency(row.chargeUsd, "USD")}
            </span>
          </div>
        )}
      </td>
      <td className="py-2 text-right">
        <div className="flex flex-col items-end">
          <span>{formatCurrency(row.providerCostInr, "INR")}</span>
          <span className="text-muted-foreground text-xs">
            {formatCurrency(row.providerCostUsd, "USD")}
          </span>
        </div>
      </td>
      <td
        className={cn(
          "py-2 text-right font-medium",
          row.profitInr < 0 ? "text-destructive" : "text-emerald-600"
        )}
      >
        {formatCurrency(row.profitInr, "INR")}
      </td>
    </tr>
  );
}

function renderRechargeRow(row: RechargeTableRow) {
  return (
    <tr className="border-t text-sm" key={`${row.orderId}-${row.createdAt.toISOString()}`}>
      <td className="py-2">{format(row.createdAt, "PPpp")}</td>
      <td className="py-2 font-mono text-xs">{row.orderId.slice(0, 16)}</td>
      <td className="py-2">{row.userEmail}</td>
      <td className="py-2">{row.planName}</td>
      <td className="py-2 text-right">
        <div className="flex flex-col items-end">
          <span>{formatCurrency(row.amountInr, "INR")}</span>
          <span className="text-muted-foreground text-xs">
            {formatCurrency(row.amountUsd, "USD")}
          </span>
        </div>
      </td>
      <td className="py-2 text-right">{row.currency}</td>
      <td className="py-2">{row.expiresAt ? format(row.expiresAt, "PPpp") : "-"}</td>
      <td className="px-3 py-2 text-center"><ReceiptDownloadButton admin orderId={row.orderId} /></td>
    </tr>
  );
}

function renderModelPricingRow(row: ModelPricingRow, usdToInr: number) {
  const renderPair = (label: string, valueUsd: number) => (
    <div>
      {label}: {formatCurrency(valueUsd, "USD")} ({formatCurrency(valueUsd * usdToInr, "INR")})
    </div>
  );

  return (
    <tr className="border-t text-sm" key={row.id}>
      <td className="py-2">
        <div className="flex flex-col">
          <span>{row.name}</span>
          {row.enabled ? null : (
            <span className="text-muted-foreground text-xs">Disabled</span>
          )}
        </div>
      </td>
      <td className="py-2 capitalize">{row.provider}</td>
      <td className="py-2 text-right">{formatNumber(row.markupMultiplier, 2)}x</td>
      <td className="py-2 text-muted-foreground text-xs">
        {renderPair("Input", row.userInputUsd)}
        {renderPair("Output", row.userOutputUsd)}
      </td>
      <td className="py-2 text-muted-foreground text-xs">
        {renderPair("Input", row.providerInputUsd)}
        {renderPair("Output", row.providerOutputUsd)}
      </td>
      <td className="py-2 text-muted-foreground text-xs">
        {renderPair("Input", row.profitInputUsd)}
        {renderPair("Output", row.profitOutputUsd)}
      </td>
      <td className="py-2 text-right font-medium">
        {Number.isFinite(row.marginPercent) ? `${row.marginPercent.toFixed(2)}%` : "-"}
      </td>
    </tr>
  );
}

export default async function AdminAccountPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const from = parseDate(resolvedSearchParams?.from);
  const to = parseDate(resolvedSearchParams?.to);
  const costFrom = parseDate(resolvedSearchParams?.costFrom);
  const costTo = parseDate(resolvedSearchParams?.costTo);
  const costCurrency = parseCostCurrency(resolvedSearchParams?.costCurrency);
  const page = Math.max(1, Number.parseInt(resolvedSearchParams?.page ?? "1", 10));
  const pageSize = Math.min(
    Math.max(
      1,
      Number.parseInt(
        resolvedSearchParams?.pageSize ?? String(DEFAULT_PAGE_SIZE),
        10
      )
    ),
    MAX_PAGE_SIZE
  );

  const usdToInrPromise = adminQueryResult({
    fallback: getFallbackUsdToInrRate(),
    label: "account.usd-to-inr",
    promise: getUsdToInrRate().then((result) => result.rate),
    timeoutMs: 1500,
  });
  const costBreakdownPromise = adminQueryResult({
    fallback: EMPTY_COST_BREAKDOWN,
    label: "account.cost-breakdown",
    promise: getAdminApiCostBreakdown({
      range: costFrom || costTo ? { start: costFrom, end: costTo } : undefined,
    }),
    timeoutMs: ADMIN_ACCOUNT_QUERY_TIMEOUT_MS,
  });
  // Revenue converts USD recharges to INR inside the query, so it waits for
  // the (short-timeout, fallback-backed) exchange rate.
  const chatSummariesPromise = usdToInrPromise.then((rate) =>
    adminQueryResult({
      fallback: EMPTY_CHAT_SUMMARIES,
      label: "account.chat-financial-summaries",
      promise: listChatFinancialSummaries({
        range: { start: from, end: to },
        limit: pageSize,
        offset: (page - 1) * pageSize,
        usdToInr: rate.data,
      }),
      timeoutMs: ADMIN_ACCOUNT_QUERY_TIMEOUT_MS,
    })
  );
  const rechargeSummariesPromise = adminQueryResult({
    fallback: [] as RechargeSummariesResult,
    label: "account.recharge-totals",
    promise: listPaidRechargeTotals({ start: from, end: to }),
    timeoutMs: ADMIN_ACCOUNT_QUERY_TIMEOUT_MS,
  });
  const partnerPayoutsPromise = usdToInrPromise.then((rate) =>
    adminQueryResult({
      fallback: EMPTY_PARTNER_PAYOUTS,
      label: "account.partner-payouts",
      promise: getPartnerPayoutTotals({
        range: { start: from, end: to },
        usdToInr: rate.data,
      }),
      timeoutMs: ADMIN_ACCOUNT_QUERY_TIMEOUT_MS,
    })
  );
  const rechargeRecordsPromise = adminQueryResult({
    fallback: EMPTY_RECHARGE_RECORDS,
    label: "account.recharge-records",
    promise: listRechargeRecords({
      range: { start: from, end: to },
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    timeoutMs: ADMIN_ACCOUNT_QUERY_TIMEOUT_MS,
  });
  const modelConfigsPromise = adminQueryResult({
    fallback: [] as ModelConfig[],
    label: "account.model-configs",
    promise: listModelConfigs({
      includeDeleted: false,
      includeDisabled: true,
    }),
    timeoutMs: ADMIN_ACCOUNT_QUERY_TIMEOUT_MS,
  });

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        description="Track revenue, provider cost, and margin for each chat session."
        navHref="/admin/account"
        title="Per-chat profit"
      />

      <Suspense fallback={<AccountOverviewFallback />}>
        <AccountOverviewSection
          chatSummariesPromise={chatSummariesPromise}
          hasRange={Boolean(from || to)}
          partnerPayoutsPromise={partnerPayoutsPromise}
          rechargeSummariesPromise={rechargeSummariesPromise}
          usdToInrPromise={usdToInrPromise}
        />
      </Suspense>

      <Suspense fallback={<AccountCostFallback />}>
        <AccountCostSection
          costBreakdownPromise={costBreakdownPromise}
          costCurrency={costCurrency}
          costFrom={costFrom}
          costTo={costTo}
          resolvedSearchParams={resolvedSearchParams}
          usdToInrPromise={usdToInrPromise}
        />
      </Suspense>

      <Suspense fallback={<AccountChatProfitFallback />}>
        <AccountChatProfitSection
          chatSummariesPromise={chatSummariesPromise}
          from={from}
          page={page}
          pageSize={pageSize}
          resolvedSearchParams={resolvedSearchParams}
          to={to}
          usdToInrPromise={usdToInrPromise}
        />
      </Suspense>

      <Suspense fallback={<AccountRechargeFallback />}>
        <AccountRechargeSection
          page={page}
          pageSize={pageSize}
          rechargeRecordsPromise={rechargeRecordsPromise}
          resolvedSearchParams={resolvedSearchParams}
          usdToInrPromise={usdToInrPromise}
        />
      </Suspense>

      <Suspense fallback={<AccountModelPricingFallback />}>
        <AccountModelPricingSection
          modelConfigsPromise={modelConfigsPromise}
          usdToInrPromise={usdToInrPromise}
        />
      </Suspense>
    </div>
  );
}

async function AccountOverviewSection({
  chatSummariesPromise,
  hasRange,
  partnerPayoutsPromise,
  rechargeSummariesPromise,
  usdToInrPromise,
}: {
  chatSummariesPromise: Promise<ChatSummariesQueryResult>;
  hasRange: boolean;
  partnerPayoutsPromise: Promise<PartnerPayoutsQueryResult>;
  rechargeSummariesPromise: Promise<RechargeSummariesQueryResult>;
  usdToInrPromise: Promise<RateQueryResult>;
}) {
  const [
    chatSummariesResult,
    partnerPayoutsResult,
    rechargeSummariesResult,
    usdToInrResult,
  ] = await Promise.all([
    chatSummariesPromise,
    partnerPayoutsPromise,
    rechargeSummariesPromise,
    usdToInrPromise,
  ]);
  const chatSummaries = chatSummariesResult.data;
  const partnerPayouts = partnerPayoutsResult.data;
  const usdToInr = usdToInrResult.data;
  const rechargeTotals = rechargeSummariesResult.ok
    ? aggregateRechargeTotals(rechargeSummariesResult.data, usdToInr)
    : { totalInr: 0, totalUsd: 0 };
  const rangeLabel = hasRange ? "in the selected range" : "all time";
  const earnedRevenueInr = chatSummaries.totals.userChargeInr;
  const totalProviderCostInr = chatSummaries.totals.providerCostUsd * usdToInr;
  const partnerPayoutsInr =
    partnerPayouts.couponRewardsInr + partnerPayouts.referralCommissionsInr;
  // Profit is matched to usage: revenue is recognised when paid credits are
  // spent, not when a recharge is collected, so unspent balances are excluded.
  const netProfitInr = earnedRevenueInr - totalProviderCostInr - partnerPayoutsInr;
  const avgProfitInr = chatSummaries.total > 0 ? netProfitInr / chatSummaries.total : 0;
  const profitConfirmed = chatSummariesResult.ok && partnerPayoutsResult.ok;
  const summaryCards: MetricCard[] = [
    {
      title: "Total recharged",
      value: rechargeSummariesResult.ok
        ? `${formatCurrency(rechargeTotals.totalUsd, "USD")} / ${formatCurrency(rechargeTotals.totalInr, "INR")}`
        : "Unavailable",
      description: `Cash users paid ${rangeLabel}, after coupon discounts. Unspent balances are not counted as revenue until used.`,
    },
    {
      title: "Earned revenue",
      value: chatSummariesResult.ok
        ? formatCurrency(earnedRevenueInr, "INR")
        : "Unavailable",
      description: `Paid credits spent ${rangeLabel}, valued at what each user paid per credit. Free and admin-granted credits earn nothing.`,
    },
    {
      title: "Provider cost",
      value: chatSummariesResult.ok
        ? `${formatCurrency(chatSummaries.totals.providerCostUsd, "USD")} / ${formatCurrency(totalProviderCostInr, "INR")}`
        : "Unavailable",
      description:
        "Chat, live voice, image and web-search provider spend, including free usage and system-prompt tokens.",
    },
    {
      title: "Creator payouts",
      value: partnerPayoutsResult.ok
        ? formatCurrency(partnerPayoutsInr, "INR")
        : "Unavailable",
      description: partnerPayoutsResult.ok
        ? `Coupon rewards ${formatCurrency(partnerPayouts.couponRewardsInr, "INR")}, referral commissions ${formatCurrency(partnerPayouts.referralCommissionsInr, "INR")} accrued ${rangeLabel}.`
        : "Coupon rewards and referral commissions could not be confirmed.",
    },
    {
      title: "Net profit",
      value: profitConfirmed ? formatCurrency(netProfitInr, "INR") : "Unavailable",
      description: profitConfirmed
        ? `Earned revenue minus provider cost and creator payouts. Average per chat: ${formatCurrency(avgProfitInr, "INR")}. Payment gateway and app store fees are not included.`
        : "Needs confirmed usage and creator payout data.",
    },
  ];

  return (
    <AccountSection defaultOpen title="Overview">
      {!chatSummariesResult.ok || !rechargeSummariesResult.ok || !partnerPayoutsResult.ok || !usdToInrResult.ok ? (
        <div className="mb-4">
          <AccountQueryWarning>
            Some account totals could not be confirmed. Confirmed sections still show real data; unavailable totals are not replaced with zero.
            {!usdToInrResult.ok ? " INR conversions are using the fallback exchange rate." : ""}
          </AccountQueryWarning>
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {summaryCards.map((card) => (
          <article
            className="rounded-lg border bg-background p-4 shadow-sm"
            key={card.title}
          >
            <div className="font-medium text-muted-foreground text-sm">
              {card.title}
            </div>
            <div className="mt-2 font-semibold text-lg">{card.value}</div>
            {card.description ? (
              <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
                {card.description}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </AccountSection>
  );
}

async function AccountCostSection({
  costBreakdownPromise,
  costCurrency,
  costFrom,
  costTo,
  resolvedSearchParams,
  usdToInrPromise,
}: {
  costBreakdownPromise: Promise<CostBreakdownQueryResult>;
  costCurrency: CostCurrency;
  costFrom: Date | undefined;
  costTo: Date | undefined;
  resolvedSearchParams: SearchParams | undefined;
  usdToInrPromise: Promise<RateQueryResult>;
}) {
  const [costBreakdownResult, usdToInrResult] = await Promise.all([
    costBreakdownPromise,
    usdToInrPromise,
  ]);
  const costBreakdown = costBreakdownResult.data;
  const usdToInr = usdToInrResult.data;
  const { preview: costFeatureRowsPreview, overflow: costFeatureRowsOverflow } =
    splitPreviewRows(costBreakdown.featureSummaries);
  const { preview: costModelRowsPreview, overflow: costModelRowsOverflow } =
    splitPreviewRows(costBreakdown.modelSummaries);
  const { preview: costDailyRowsPreview, overflow: costDailyRowsOverflow } =
    splitPreviewRows(costBreakdown.dailySummaries);
  const { preview: otherUsageRowsPreview, overflow: otherUsageRowsOverflow } =
    splitPreviewRows(costBreakdown.otherUsageSummaries);

  return (
    <AccountSection title="Cost">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-muted-foreground text-sm">
          API cost dashboard by feature, model, and day. Chat, live voice, image and web-search costs use the provider prices captured when each request was billed (unbilled usage uses current model prices). Embedding costs are estimated from indexed content size. Usage with no recoverable provider cost is listed separately.
        </p>
        <Link
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          href={buildSearchHref(resolvedSearchParams, {
            costFrom: null,
            costTo: null,
            costCurrency,
          })}
        >
          View all-time
        </Link>
      </div>

      {!costBreakdownResult.ok || !usdToInrResult.ok ? (
        <div className="mt-4">
          <AccountQueryWarning>
            Cost data could not be fully confirmed. Unavailable rows are shown as unavailable instead of zero.
            {!usdToInrResult.ok ? " INR conversions are using the fallback exchange rate." : ""}
          </AccountQueryWarning>
        </div>
      ) : null}

      <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
        <PreservedSearchParamsInputs
          exclude={["costFrom", "costTo", "costCurrency"]}
          searchParams={resolvedSearchParams}
        />
        <div className="flex flex-col">
          <label className="font-medium text-muted-foreground text-xs" htmlFor="costFrom">Start date</label>
          <input className="rounded-md border bg-background px-3 py-2 text-sm" defaultValue={costFrom ? format(costFrom, "yyyy-MM-dd") : ""} id="costFrom" name="costFrom" type="date" />
        </div>
        <div className="flex flex-col">
          <label className="font-medium text-muted-foreground text-xs" htmlFor="costTo">End date</label>
          <input className="rounded-md border bg-background px-3 py-2 text-sm" defaultValue={costTo ? format(costTo, "yyyy-MM-dd") : ""} id="costTo" name="costTo" type="date" />
        </div>
        <div className="flex flex-col">
          <label className="font-medium text-muted-foreground text-xs" htmlFor="costCurrency">Currency</label>
          <select className="rounded-md border bg-background px-3 py-2 text-sm" defaultValue={costCurrency} id="costCurrency" name="costCurrency">
            <option value="INR">INR</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <Button type="submit" variant="secondary">Apply</Button>
      </form>

      <div className="mt-6 flex flex-col gap-4">
        <article className="rounded-lg border bg-background p-4"><div className="font-medium text-muted-foreground text-sm">Total cost</div><div className="mt-2 font-semibold text-lg">{costBreakdownResult.ok ? formatCostInCurrency(costBreakdown.totalCostUsd, costCurrency, usdToInr) : "Unavailable"}</div><div className="mt-1 text-muted-foreground text-xs">Selected range</div></article>
        <article className="rounded-lg border bg-background p-4"><div className="font-medium text-muted-foreground text-sm">Exact tracked cost</div><div className="mt-2 font-semibold text-lg">{costBreakdownResult.ok ? formatCostInCurrency(costBreakdown.exactCostUsd, costCurrency, usdToInr) : "Unavailable"}</div><div className="mt-1 text-muted-foreground text-xs">Chat, live voice, images and web search</div></article>
        <article className="rounded-lg border bg-background p-4"><div className="font-medium text-muted-foreground text-sm">Estimated embedding cost</div><div className="mt-2 font-semibold text-lg">{costBreakdownResult.ok ? formatCostInCurrency(costBreakdown.estimatedCostUsd, costCurrency, usdToInr) : "Unavailable"}</div><div className="mt-1 text-muted-foreground text-xs">Knowledge embedding and index updates</div></article>
        <article className="rounded-lg border bg-background p-4"><div className="font-medium text-muted-foreground text-sm">Other tracked usage</div><div className="mt-2 font-semibold text-lg">{costBreakdownResult.ok ? formatNumber(costBreakdown.otherUsageSummaries.reduce((total, row) => total + row.usageCount, 0)) : "Unavailable"}</div><div className="mt-1 text-muted-foreground text-xs">Tracked events without stored provider cost</div></article>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <SubsectionPanel title="Cost by feature">
          <div className="overflow-x-auto">
            <table className="w-max min-w-[920px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead className="text-muted-foreground text-xs uppercase"><tr><th className="py-3 text-left">Feature</th><th className="py-3 text-left">Method</th><th className="py-3 text-left">Usage</th><th className="py-3 text-right">Models</th><th className="py-3 text-right">Cost</th><th className="py-3 text-left">Notes</th></tr></thead>
              <tbody>{!costBreakdownResult.ok ? <tr><td className="py-6 text-center text-muted-foreground" colSpan={6}>Unable to load API cost data. Retry after the database query recovers.</td></tr> : costBreakdown.featureSummaries.length === 0 ? <tr><td className="py-6 text-center text-muted-foreground" colSpan={6}>No API cost data found for the selected range.</td></tr> : <InlineExpandableRows colSpan={6} overflowRows={costFeatureRowsOverflow.map((row) => renderCostFeatureRow(row, costCurrency, usdToInr))} previewRows={costFeatureRowsPreview.map((row) => renderCostFeatureRow(row, costCurrency, usdToInr))} />}</tbody>
            </table>
          </div>
        </SubsectionPanel>

        <SubsectionPanel title="Cost by model">
          <div className="overflow-x-auto">
            <table className="w-max min-w-[920px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead className="text-muted-foreground text-xs uppercase"><tr><th className="py-3 text-left">Feature</th><th className="py-3 text-left">Model</th><th className="py-3 text-left">Provider</th><th className="py-3 text-left">Method</th><th className="py-3 text-left">Usage</th><th className="py-3 text-right">Cost</th></tr></thead>
              <tbody>{!costBreakdownResult.ok ? <tr><td className="py-6 text-center text-muted-foreground" colSpan={6}>Unable to load per-model cost data.</td></tr> : costBreakdown.modelSummaries.length === 0 ? <tr><td className="py-6 text-center text-muted-foreground" colSpan={6}>No per-model cost data found for the selected range.</td></tr> : <InlineExpandableRows colSpan={6} overflowRows={costModelRowsOverflow.map((row) => renderCostModelRow(row, costCurrency, usdToInr))} previewRows={costModelRowsPreview.map((row) => renderCostModelRow(row, costCurrency, usdToInr))} />}</tbody>
            </table>
          </div>
        </SubsectionPanel>

        <SubsectionPanel title="Daily cost trend">
          <div className="overflow-x-auto">
            <table className="w-max min-w-[980px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead className="text-muted-foreground text-xs uppercase"><tr><th className="py-3 text-left">Date</th><th className="py-3 text-right">Chat</th><th className="py-3 text-right">Live voice</th><th className="py-3 text-right">Images</th><th className="py-3 text-right">Web search</th><th className="py-3 text-right">Embeddings</th><th className="py-3 text-right">Total</th><th className="py-3 text-right">Other usage</th></tr></thead>
              <tbody>{!costBreakdownResult.ok ? <tr><td className="py-6 text-center text-muted-foreground" colSpan={8}>Unable to load daily cost data.</td></tr> : costBreakdown.dailySummaries.length === 0 ? <tr><td className="py-6 text-center text-muted-foreground" colSpan={8}>No daily cost data found for the selected range.</td></tr> : <InlineExpandableRows colSpan={8} overflowRows={costDailyRowsOverflow.map((row) => renderDailyCostRow(row, costCurrency, usdToInr))} previewRows={costDailyRowsPreview.map((row) => renderDailyCostRow(row, costCurrency, usdToInr))} />}</tbody>
            </table>
          </div>
        </SubsectionPanel>

        <SubsectionPanel title="Tracked other API usage">
          <div className="overflow-x-auto">
            <table className="w-max min-w-[720px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead className="text-muted-foreground text-xs uppercase"><tr><th className="py-3 text-left">Tracked usage</th><th className="py-3 text-right">Events</th><th className="py-3 text-right">Tokens</th><th className="py-3 text-left">Notes</th></tr></thead>
              <tbody>{!costBreakdownResult.ok ? <tr><td className="py-6 text-center text-muted-foreground" colSpan={4}>Unable to load other tracked API usage.</td></tr> : costBreakdown.otherUsageSummaries.length === 0 ? <tr><td className="py-6 text-center text-muted-foreground" colSpan={4}>No other tracked API usage found for the selected range.</td></tr> : <InlineExpandableRows colSpan={4} overflowRows={otherUsageRowsOverflow.map((row) => renderOtherUsageRow(row))} previewRows={otherUsageRowsPreview.map((row) => renderOtherUsageRow(row))} />}</tbody>
            </table>
          </div>
        </SubsectionPanel>
      </div>
    </AccountSection>
  );
}

async function AccountChatProfitSection({
  chatSummariesPromise,
  from,
  page,
  pageSize,
  resolvedSearchParams,
  to,
  usdToInrPromise,
}: {
  chatSummariesPromise: Promise<ChatSummariesQueryResult>;
  from: Date | undefined;
  page: number;
  pageSize: number;
  resolvedSearchParams: SearchParams | undefined;
  to: Date | undefined;
  usdToInrPromise: Promise<RateQueryResult>;
}) {
  const [chatSummariesResult, usdToInrResult] = await Promise.all([
    chatSummariesPromise,
    usdToInrPromise,
  ]);
  const chatSummaries = chatSummariesResult.data;
  const usdToInr = usdToInrResult.data;
  const chatRows = mapChatRows(chatSummaries.records, usdToInr);
  const { preview: chatRowsPreview, overflow: chatRowsOverflow } =
    splitPreviewRows(chatRows);
  const totalPages = Math.max(1, Math.ceil(chatSummaries.total / pageSize));
  const chatExportRows = chatRows.map((row) => ({
    chatId: row.chatId,
    userEmail: row.userEmail,
    createdAt: row.createdAt ? format(row.createdAt, "yyyy-MM-dd HH:mm:ss") : "",
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    credits: row.credits,
    chargeUsd: row.chargeUsd,
    chargeInr: row.chargeInr,
    providerCostUsd: row.providerCostUsd,
    providerCostInr: row.providerCostInr,
    profitInr: row.profitInr,
  }));

  return (
    <AccountSection title="Chat profit log">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Revenue and provider cost for each chat transcript.
        </p>
        <ExportButton rows={chatExportRows} />
      </div>

      {!chatSummariesResult.ok || !usdToInrResult.ok ? (
        <div className="mt-4">
          <AccountQueryWarning>
            Chat profit data could not be confirmed. This section is not showing fake zero usage.
            {!usdToInrResult.ok ? " INR conversions are using the fallback exchange rate." : ""}
          </AccountQueryWarning>
        </div>
      ) : null}

      <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
        <PreservedSearchParamsInputs
          exclude={["from", "to", "page", "pageSize"]}
          searchParams={resolvedSearchParams}
        />
        <div className="flex flex-col">
          <label className="font-medium text-muted-foreground text-xs" htmlFor="from">
            From
          </label>
          <input className="rounded-md border bg-background px-3 py-2 text-sm" defaultValue={from ? format(from, "yyyy-MM-dd") : ""} id="from" name="from" type="date" />
        </div>
        <div className="flex flex-col">
          <label className="font-medium text-muted-foreground text-xs" htmlFor="to">
            To
          </label>
          <input className="rounded-md border bg-background px-3 py-2 text-sm" defaultValue={to ? format(to, "yyyy-MM-dd") : ""} id="to" name="to" type="date" />
        </div>
        <div className="flex flex-col">
          <label className="font-medium text-muted-foreground text-xs" htmlFor="pageSize">
            Rows per page
          </label>
          <input className="w-28 rounded-md border bg-background px-3 py-2 text-sm" defaultValue={pageSize} id="pageSize" max={MAX_PAGE_SIZE} min={1} name="pageSize" type="number" />
        </div>
        <input name="page" type="hidden" value="1" />
        <Button type="submit" variant="secondary">
          Apply filters
        </Button>
      </form>

      <div className="mt-4 text-muted-foreground text-sm">
        {chatSummariesResult.ok
          ? `Showing ${chatRows.length} of ${chatSummaries.total} chats`
          : "Chat usage total unavailable"}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-max min-w-[980px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
          <thead className="text-muted-foreground text-xs uppercase">
            <tr>
              <th className="py-3 text-left">Date</th>
              <th className="py-3 text-left">Chat ID</th>
              <th className="py-3 text-left">User</th>
              <th className="py-3 text-right">Credits charged (in/out tokens)</th>
              <th className="py-3 text-right">User charge</th>
              <th className="py-3 text-right">Provider cost</th>
              <th className="py-3 text-right">Profit (INR)</th>
            </tr>
          </thead>
          <tbody>
            {!chatSummariesResult.ok ? (
              <tr>
                <td className="py-6 text-center text-muted-foreground" colSpan={7}>
                  Unable to load chat usage for the selected range.
                </td>
              </tr>
            ) : chatRows.length === 0 ? (
              <tr>
                <td className="py-6 text-center text-muted-foreground" colSpan={7}>
                  No chat usage found for the selected range.
                </td>
              </tr>
            ) : (
              <InlineExpandableRows
                colSpan={7}
                overflowRows={chatRowsOverflow.map((row) => renderChatProfitRow(row))}
                previewRows={chatRowsPreview.map((row) => renderChatProfitRow(row))}
              />
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          {chatSummariesResult.ok ? `Page ${page} of ${totalPages}` : "Pagination unavailable"}
        </span>
        <div className="flex items-center gap-2">
          <PaginationLink direction="prev" disabled={!chatSummariesResult.ok || page <= 1} label="Previous" page={page - 1} searchParams={resolvedSearchParams} />
          <PaginationLink direction="next" disabled={!chatSummariesResult.ok || page >= totalPages} label="Next" page={page + 1} searchParams={resolvedSearchParams} />
        </div>
      </div>
    </AccountSection>
  );
}

async function AccountRechargeSection({
  page,
  pageSize,
  rechargeRecordsPromise,
  resolvedSearchParams,
  usdToInrPromise,
}: {
  page: number;
  pageSize: number;
  rechargeRecordsPromise: Promise<RechargeRecordsQueryResult>;
  resolvedSearchParams: SearchParams | undefined;
  usdToInrPromise: Promise<RateQueryResult>;
}) {
  const [rechargeRecordsResult, usdToInrResult] = await Promise.all([
    rechargeRecordsPromise,
    usdToInrPromise,
  ]);
  const rechargeRecords = rechargeRecordsResult.data;
  const usdToInr = usdToInrResult.data;
  const rechargeRows = mapRechargeRows(rechargeRecords.records, usdToInr);
  const { preview: rechargeRowsPreview, overflow: rechargeRowsOverflow } =
    splitPreviewRows(rechargeRows);
  const rechargeTotalPages = Math.max(1, Math.ceil(rechargeRecords.total / pageSize));
  const rechargeExportRows = rechargeRows.map((row) => ({
    orderId: row.orderId,
    userEmail: row.userEmail,
    planName: row.planName,
    createdAt: format(row.createdAt, "yyyy-MM-dd HH:mm:ss"),
    updatedAt: format(row.updatedAt, "yyyy-MM-dd HH:mm:ss"),
    amountUsd: row.amountUsd,
    amountInr: row.amountInr,
    currency: row.currency,
    expiresAt: row.expiresAt ? format(row.expiresAt, "yyyy-MM-dd HH:mm:ss") : "",
  }));

  return (
    <AccountSection title="Recharge log">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Breakdown of every successful top-up and the current subscription expiry.
        </p>
        <RechargeExportButton rows={rechargeExportRows} />
      </div>

      {!rechargeRecordsResult.ok || !usdToInrResult.ok ? (
        <div className="mt-4">
          <AccountQueryWarning>
            Recharge records could not be confirmed. This section is not showing fake zero payments.
            {!usdToInrResult.ok ? " INR conversions are using the fallback exchange rate." : ""}
          </AccountQueryWarning>
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-max min-w-[920px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
          <thead className="text-muted-foreground text-xs uppercase">
            <tr>
              <th className="py-3 text-left">Date</th>
              <th className="py-3 text-left">Order ID</th>
              <th className="py-3 text-left">User</th>
              <th className="py-3 text-left">Plan</th>
              <th className="py-3 text-right">Amount</th>
              <th className="py-3 text-right">Currency</th>
              <th className="py-3 text-left">Subscription expires</th>
              <th className="px-3 py-3 text-center"><EditableTranslation translationKey="billing.receipt.title" defaultText="Receipt" /></th>
            </tr>
          </thead>
          <tbody>
            {!rechargeRecordsResult.ok ? (
              <tr>
                <td className="py-6 text-center text-muted-foreground" colSpan={8}>
                  Unable to load paid recharges for the selected range.
                </td>
              </tr>
            ) : rechargeRows.length === 0 ? (
              <tr>
                <td className="py-6 text-center text-muted-foreground" colSpan={8}>
                  No paid recharges found for the selected range.
                </td>
              </tr>
            ) : (
              <InlineExpandableRows
                colSpan={8}
                overflowRows={rechargeRowsOverflow.map((row) => renderRechargeRow(row))}
                previewRows={rechargeRowsPreview.map((row) => renderRechargeRow(row))}
              />
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          {rechargeRecordsResult.ok ? `Page ${page} of ${rechargeTotalPages}` : "Pagination unavailable"}
        </span>
        <div className="flex items-center gap-2">
          <PaginationLink direction="prev" disabled={!rechargeRecordsResult.ok || page <= 1} label="Previous" page={page - 1} searchParams={resolvedSearchParams} />
          <PaginationLink direction="next" disabled={!rechargeRecordsResult.ok || page >= rechargeTotalPages} label="Next" page={page + 1} searchParams={resolvedSearchParams} />
        </div>
      </div>
    </AccountSection>
  );
}

async function AccountModelPricingSection({
  modelConfigsPromise,
  usdToInrPromise,
}: {
  modelConfigsPromise: Promise<ModelConfigsQueryResult>;
  usdToInrPromise: Promise<RateQueryResult>;
}) {
  const [modelConfigsResult, usdToInrResult] = await Promise.all([
    modelConfigsPromise,
    usdToInrPromise,
  ]);
  const modelConfigs = modelConfigsResult.data;
  const usdToInr = usdToInrResult.data;
  const modelRows = mapModelPricingRows(modelConfigs);
  const { preview: modelRowsPreview, overflow: modelRowsOverflow } =
    splitPreviewRows(modelRows);

  return (
    <AccountSection title="Model pricing summary">
      <p className="text-muted-foreground text-sm">
        Customer price versus provider cost per one million tokens at the base
        recharge rate (provider cost x markup). Larger recharge plans with bonus
        credits earn less per token; the chat profit log uses what each user
        actually paid.
      </p>

      {!modelConfigsResult.ok || !usdToInrResult.ok ? (
        <div className="mt-4">
          <AccountQueryWarning>
            Model pricing could not be confirmed. Missing rows are unavailable rather than treated as unconfigured.
            {!usdToInrResult.ok ? " INR conversions are using the fallback exchange rate." : ""}
          </AccountQueryWarning>
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-max min-w-[980px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
          <thead className="text-muted-foreground text-xs uppercase">
            <tr>
              <th className="py-3 text-left">Model</th>
              <th className="py-3 text-left">Provider</th>
              <th className="py-3 text-right">Markup</th>
              <th className="py-3 text-left">Customer price / 1M</th>
              <th className="py-3 text-left">Provider cost / 1M</th>
              <th className="py-3 text-left">Profit / 1M</th>
              <th className="py-3 text-right">Margin</th>
            </tr>
          </thead>
          <tbody>
            {!modelConfigsResult.ok ? (
              <tr>
                <td className="py-6 text-center text-muted-foreground" colSpan={7}>
                  Unable to load model pricing information.
                </td>
              </tr>
            ) : modelRows.length === 0 ? (
              <tr>
                <td className="py-6 text-center text-muted-foreground" colSpan={7}>
                  No model pricing information available.
                </td>
              </tr>
            ) : (
              <InlineExpandableRows
                colSpan={7}
                overflowRows={modelRowsOverflow.map((row) => renderModelPricingRow(row, usdToInr))}
                previewRows={modelRowsPreview.map((row) => renderModelPricingRow(row, usdToInr))}
              />
            )}
          </tbody>
        </table>
      </div>
    </AccountSection>
  );
}

function AccountSectionFallback({
  title,
  cards = 0,
  rows = 4,
}: {
  title: string;
  cards?: number;
  rows?: number;
}) {
  return (
    <AccountSection title={title}>
      {cards > 0 ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: cards }, (_, index) => (
            <div
              className="h-24 animate-pulse rounded-lg border bg-background"
              key={`${title}-card-${index + 1}`}
            />
          ))}
        </div>
      ) : null}
      {rows > 0 ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: rows }, (_, index) => (
            <div
              className="h-12 animate-pulse rounded-lg bg-muted/50"
              key={`${title}-row-${index + 1}`}
            />
          ))}
        </div>
      ) : null}
    </AccountSection>
  );
}

function AccountOverviewFallback() {
  return <AccountSectionFallback cards={5} rows={0} title="Overview" />;
}

function AccountCostFallback() {
  return <AccountSectionFallback cards={4} rows={5} title="Cost" />;
}

function AccountChatProfitFallback() {
  return <AccountSectionFallback rows={6} title="Chat profit log" />;
}

function AccountRechargeFallback() {
  return <AccountSectionFallback rows={6} title="Recharge log" />;
}

function AccountModelPricingFallback() {
  return <AccountSectionFallback rows={5} title="Model pricing summary" />;
}

function PaginationLink({
  disabled,
  label,
  page,
  direction: _direction,
  searchParams,
}: {
  disabled: boolean;
  label: string;
  page: number;
  direction: "prev" | "next";
  searchParams?: SearchParams;
}) {
  const params = new URLSearchParams();
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (typeof value === "string") params.set(key, value);
    }
  }
  params.set("page", String(page));

  if (disabled) {
    return <span className="rounded-md border px-3 py-1.5 text-muted-foreground">{label}</span>;
  }

  return (
    <Link className="rounded-md border px-3 py-1.5 transition hover:bg-muted" href={`?${params.toString()}`}>
      {label}
    </Link>
  );
}
