import { format } from "date-fns";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TOKENS_PER_CREDIT } from "@/lib/constants";
import {
  getAdminApiCostBreakdown,
  type ChatFinancialSummary,
  listChatFinancialSummaries,
  listModelConfigs,
  listPaidRechargeTotals,
  listRechargeRecords,
  type RechargeRecord,
} from "@/lib/db/queries";
import type { ModelConfig } from "@/lib/db/schema";
import { getUsdToInrRate } from "@/lib/services/exchange-rate";
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

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

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
  userInputUsd: number;
  userOutputUsd: number;
  providerInputUsd: number;
  providerOutputUsd: number;
  totalUserUsd: number;
  totalProviderUsd: number;
  profitUsd: number;
  profitInr: number;
  marginPercent: number;
  enabled: boolean;
};

function parseDate(value?: string): Date | undefined {
  if (!value) {
    return;
  }

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

function formatCostInCurrency({
  valueUsd,
  currency,
  usdToInr,
}: {
  valueUsd: number;
  currency: CostCurrency;
  usdToInr: number;
}) {
  const converted = currency === "USD" ? valueUsd : valueUsd * usdToInr;
  return formatCurrency(converted, currency);
}

function formatNumber(value: number, fractionDigits = 0) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function buildSummaryCards({
  totalRechargeUsd,
  totalRechargeInr,
  totalProviderCostUsd,
  usdToInr,
  chatCount,
}: {
  totalRechargeUsd: number;
  totalRechargeInr: number;
  totalProviderCostUsd: number;
  usdToInr: number;
  chatCount: number;
}): MetricCard[] {
  const totalProviderCostInr = totalProviderCostUsd * usdToInr;
  const netProfitInr = totalRechargeInr - totalProviderCostInr;
  const avgProfitInr = chatCount > 0 ? netProfitInr / chatCount : 0;

  return [
    {
      title: "Total recharged",
      value: `${formatCurrency(totalRechargeUsd, "USD")} / ${formatCurrency(
        totalRechargeInr,
        "INR"
      )}`,
      description: "All-time amount users have successfully paid.",
    },
    {
      title: "Provider cost",
      value: `${formatCurrency(
        totalProviderCostUsd,
        "USD"
      )} / ${formatCurrency(totalProviderCostInr, "INR")}`,
      description: "Estimated spend to the underlying model providers.",
    },
    {
      title: "Net profit",
      value: formatCurrency(netProfitInr, "INR"),
      description: `Average per chat: ${formatCurrency(avgProfitInr, "INR")}`,
    },
  ];
}

function mapChatRows(
  records: ChatFinancialSummary[],
  usdToInr: number
): ChatProfitRow[] {
  return records.map((record) => {
    const createdAt = record.chatCreatedAt ?? record.usageStartedAt ?? null;
    const totalTokens = record.totalInputTokens + record.totalOutputTokens;
    const credits = totalTokens / TOKENS_PER_CREDIT;
    const chargeInr = record.userChargeInr;
    const chargeUsd = usdToInr > 0 ? chargeInr / usdToInr : 0;
    const providerCostUsd = record.providerCostUsd;
    const providerCostInr = providerCostUsd * usdToInr;
    const profitInr = chargeInr - providerCostInr;
    const isFreeUsage = !chargeInr || chargeInr <= 0;

    return {
      chatId: record.chatId ?? "(unknown)",
      userEmail: record.email ?? "Unknown user",
      createdAt,
      inputTokens: record.totalInputTokens,
      outputTokens: record.totalOutputTokens,
      credits,
      chargeUsd,
      chargeInr,
      isFreeUsage,
      providerCostUsd,
      providerCostInr,
      profitInr,
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

function normalizeCurrencyAmount(amount: number, currency: string) {
  const divisor =
    currency.toUpperCase() === "USD"
      ? 100
      : currency.toUpperCase() === "INR"
        ? 100
        : 100;
  return amount / divisor;
}

function mapRechargeRows(
  records: RechargeRecord[],
  usdToInr: number
): RechargeTableRow[] {
  return records.map((record) => {
    const baseAmount = normalizeCurrencyAmount(record.amount, record.currency);
    const currency = record.currency.toUpperCase();
    const amountUsd =
      currency === "USD"
        ? baseAmount
        : usdToInr > 0
          ? baseAmount / usdToInr
          : 0;
    const amountInr = currency === "INR" ? baseAmount : baseAmount * usdToInr;

    return {
      orderId: record.orderId,
      userEmail: record.email ?? "Unknown user",
      planName: record.planName ?? "—",
      amountUsd,
      amountInr,
      currency,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      expiresAt: record.expiresAt,
    };
  });
}

function mapModelPricingRows(
  configs: ModelConfig[],
  usdToInr: number
): ModelPricingRow[] {
  return configs.map((config) => {
    const userInputUsd = 0;
    const userOutputUsd = 0;
    const providerInputUsd = Number(config.inputProviderCostPerMillion ?? 0);
    const providerOutputUsd = Number(config.outputProviderCostPerMillion ?? 0);
    const totalUserUsd = userInputUsd + userOutputUsd;
    const totalProviderUsd = providerInputUsd + providerOutputUsd;
    const profitUsd = totalUserUsd - totalProviderUsd;
    const profitInr = profitUsd * usdToInr;
    const marginPercent =
      totalUserUsd > 0 ? (profitUsd / totalUserUsd) * 100 : 0;

    return {
      id: config.id,
      name: config.displayName,
      provider: config.provider,
      userInputUsd,
      userOutputUsd,
      providerInputUsd,
      providerOutputUsd,
      totalUserUsd,
      totalProviderUsd,
      profitUsd,
      profitInr,
      marginPercent,
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
      if (typeof value === "string" && value.length > 0) {
        params.set(key, value);
      }
    }
  }

  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === "string" && value.length > 0) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
  }

  const query = params.toString();
  return query.length > 0 ? `?${query}` : "?";
}

function PreservedSearchParamsInputs({
  searchParams,
  exclude,
}: {
  searchParams?: SearchParams;
  exclude: Array<keyof SearchParams>;
}) {
  if (!searchParams) {
    return null;
  }

  return (
    <>
      {Object.entries(searchParams)
        .filter(
          ([key, value]) =>
            typeof value === "string" &&
            value.length > 0 &&
            !exclude.includes(key as keyof SearchParams)
        )
        .map(([key, value]) => (
          <input key={key} name={key} type="hidden" value={value} />
        ))}
    </>
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
  const page = Math.max(
    1,
    Number.parseInt(resolvedSearchParams?.page ?? "1", 10)
  );
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

  const [
    { rate, fetchedAt: _fetchedAt },
    costBreakdown,
    chatSummaries,
    rechargeSummaries,
    rechargeRecords,
    modelConfigs,
  ] = await Promise.all([
    getUsdToInrRate(),
    getAdminApiCostBreakdown({
      range:
        costFrom || costTo
          ? { start: costFrom, end: costTo }
          : undefined,
    }),
    listChatFinancialSummaries({
      range: { start: from, end: to },
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    listPaidRechargeTotals(),
    listRechargeRecords({
      range: { start: from, end: to },
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    listModelConfigs({ includeDeleted: false, includeDisabled: true }),
  ]);

  const usdToInr = rate;
  const chatRows = mapChatRows(chatSummaries.records, usdToInr);
  const { totalUsd: totalRechargeUsd, totalInr: totalRechargeInr } =
    aggregateRechargeTotals(rechargeSummaries, usdToInr);
  const rechargeRows = mapRechargeRows(rechargeRecords.records, usdToInr);
  const modelRows = mapModelPricingRows(modelConfigs, usdToInr);

  const summaryCards = buildSummaryCards({
    totalRechargeUsd,
    totalRechargeInr,
    totalProviderCostUsd: chatSummaries.totals.providerCostUsd,
    usdToInr,
    chatCount: chatSummaries.total,
  });

  const totalPages = Math.max(1, Math.ceil(chatSummaries.total / pageSize));
  const rechargeTotalPages = Math.max(
    1,
    Math.ceil(rechargeRecords.total / pageSize)
  );
  const costFeatureRows = costBreakdown.featureSummaries;
  const costModelRows = costBreakdown.modelSummaries;
  const costDailyRows = costBreakdown.dailySummaries;
  const otherUsageRows = costBreakdown.otherUsageSummaries;

  const chatExportRows = chatRows.map((row) => ({
    chatId: row.chatId,
    userEmail: row.userEmail,
    createdAt: row.createdAt
      ? format(row.createdAt, "yyyy-MM-dd HH:mm:ss")
      : "",
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    credits: row.credits,
    chargeUsd: row.chargeUsd,
    chargeInr: row.chargeInr,
    providerCostUsd: row.providerCostUsd,
    providerCostInr: row.providerCostInr,
    profitInr: row.profitInr,
  }));

  const rechargeExportRows = rechargeRows.map((row) => ({
    orderId: row.orderId,
    userEmail: row.userEmail,
    planName: row.planName,
    createdAt: format(row.createdAt, "yyyy-MM-dd HH:mm:ss"),
    updatedAt: format(row.updatedAt, "yyyy-MM-dd HH:mm:ss"),
    amountUsd: row.amountUsd,
    amountInr: row.amountInr,
    currency: row.currency,
    expiresAt: row.expiresAt
      ? format(row.expiresAt, "yyyy-MM-dd HH:mm:ss")
      : "",
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl">Per-chat profit</h1>
        <p className="text-muted-foreground text-sm">
          Track revenue, provider cost, and margin for each chat session.
        </p>
      </header>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-lg">Cost</h2>
            <p className="text-muted-foreground text-sm">
              API cost dashboard by feature, model, and day. Chat completion
              costs are exact. Embedding costs are estimated from indexed
              content size. Other tracked usage is shown separately when
              historical provider cost is unavailable.
            </p>
          </div>
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

        <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
          <PreservedSearchParamsInputs
            exclude={["costFrom", "costTo", "costCurrency"]}
            searchParams={resolvedSearchParams}
          />
          <div className="flex flex-col">
            <label
              className="font-medium text-muted-foreground text-xs"
              htmlFor="costFrom"
            >
              Start date
            </label>
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              defaultValue={costFrom ? format(costFrom, "yyyy-MM-dd") : ""}
              id="costFrom"
              name="costFrom"
              type="date"
            />
          </div>
          <div className="flex flex-col">
            <label
              className="font-medium text-muted-foreground text-xs"
              htmlFor="costTo"
            >
              End date
            </label>
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              defaultValue={costTo ? format(costTo, "yyyy-MM-dd") : ""}
              id="costTo"
              name="costTo"
              type="date"
            />
          </div>
          <div className="flex flex-col">
            <label
              className="font-medium text-muted-foreground text-xs"
              htmlFor="costCurrency"
            >
              Currency
            </label>
            <select
              className="rounded-md border bg-background px-3 py-2 text-sm"
              defaultValue={costCurrency}
              id="costCurrency"
              name="costCurrency"
            >
              <option value="INR">INR</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <Button type="submit" variant="secondary">
            Apply
          </Button>
        </form>

        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <article className="flex flex-col gap-2 rounded-lg border bg-background p-4">
            <span className="font-medium text-muted-foreground text-sm">
              Total cost
            </span>
            <span className="font-semibold text-lg">
              {formatCostInCurrency({
                valueUsd: costBreakdown.totalCostUsd,
                currency: costCurrency,
                usdToInr,
              })}
            </span>
            <span className="text-muted-foreground text-xs">
              Selected range
            </span>
          </article>
          <article className="flex flex-col gap-2 rounded-lg border bg-background p-4">
            <span className="font-medium text-muted-foreground text-sm">
              Exact tracked cost
            </span>
            <span className="font-semibold text-lg">
              {formatCostInCurrency({
                valueUsd: costBreakdown.exactCostUsd,
                currency: costCurrency,
                usdToInr,
              })}
            </span>
            <span className="text-muted-foreground text-xs">
              Chat completion token usage
            </span>
          </article>
          <article className="flex flex-col gap-2 rounded-lg border bg-background p-4">
            <span className="font-medium text-muted-foreground text-sm">
              Estimated embedding cost
            </span>
            <span className="font-semibold text-lg">
              {formatCostInCurrency({
                valueUsd: costBreakdown.estimatedCostUsd,
                currency: costCurrency,
                usdToInr,
              })}
            </span>
            <span className="text-muted-foreground text-xs">
              File Search / embedding index updates
            </span>
          </article>
          <article className="flex flex-col gap-2 rounded-lg border bg-background p-4">
            <span className="font-medium text-muted-foreground text-sm">
              Untracked API usage
            </span>
            <span className="font-semibold text-lg">
              {formatNumber(
                otherUsageRows.reduce((total, row) => total + row.usageCount, 0)
              )}
            </span>
            <span className="text-muted-foreground text-xs">
              Tracked events with no stored provider cost
            </span>
          </article>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase">
              <tr>
                <th className="py-3 text-left">Feature</th>
                <th className="py-3 text-left">Method</th>
                <th className="py-3 text-left">Usage</th>
                <th className="py-3 text-right">Models</th>
                <th className="py-3 text-right">Cost</th>
                <th className="py-3 text-left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {costFeatureRows.length === 0 ? (
                <tr>
                  <td
                    className="py-6 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    No API cost data found for the selected range.
                  </td>
                </tr>
              ) : (
                costFeatureRows.map((row) => {
                  const usageLabel =
                    row.featureKey === "chat_completions"
                      ? `${formatNumber(row.usageCount)} usage rows, ${formatNumber(
                          row.inputTokens
                        )} in / ${formatNumber(row.outputTokens)} out`
                      : row.featureKey === "embeddings"
                        ? `${formatNumber(
                            row.indexedEntries
                          )} indexed entries, ${formatNumber(row.indexedChars)} chars`
                        : `${formatNumber(row.usageCount)} events, ${formatNumber(
                            row.inputTokens
                          )} tokens`;

                  return (
                    <tr className="border-t text-sm" key={row.featureKey}>
                      <td className="py-2 font-medium">{row.featureLabel}</td>
                      <td className="py-2 capitalize">
                        {row.method.replaceAll("_", " ")}
                      </td>
                      <td className="py-2">{usageLabel}</td>
                      <td className="py-2 text-right">
                        {formatNumber(row.modelCount)}
                      </td>
                      <td className="py-2 text-right">
                        {row.totalCostUsd === null
                          ? "—"
                          : formatCostInCurrency({
                              valueUsd: row.totalCostUsd,
                              currency: costCurrency,
                              usdToInr,
                            })}
                      </td>
                      <td className="py-2 text-muted-foreground text-xs">
                        {row.note ?? "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase">
              <tr>
                <th className="py-3 text-left">Feature</th>
                <th className="py-3 text-left">Model</th>
                <th className="py-3 text-left">Provider</th>
                <th className="py-3 text-left">Method</th>
                <th className="py-3 text-left">Usage</th>
                <th className="py-3 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {costModelRows.length === 0 ? (
                <tr>
                  <td
                    className="py-6 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    No per-model cost data found for the selected range.
                  </td>
                </tr>
              ) : (
                costModelRows.map((row) => {
                  const usageLabel =
                    row.featureKey === "chat_completions"
                      ? `${formatNumber(row.usageCount)} usage rows, ${formatNumber(
                          row.inputTokens
                        )} in / ${formatNumber(row.outputTokens)} out`
                      : `${formatNumber(row.indexedEntries)} indexed entries, ${formatNumber(
                          row.indexedChars
                        )} chars`;

                  return (
                    <tr className="border-t text-sm" key={row.modelKey}>
                      <td className="py-2">{row.featureLabel}</td>
                      <td className="py-2 font-medium">{row.modelLabel}</td>
                      <td className="py-2 text-muted-foreground text-xs">
                        {row.providerLabel ?? "—"}
                      </td>
                      <td className="py-2 capitalize">
                        {row.method.replaceAll("_", " ")}
                      </td>
                      <td className="py-2">{usageLabel}</td>
                      <td className="py-2 text-right">
                        {row.totalCostUsd === null
                          ? "—"
                          : formatCostInCurrency({
                              valueUsd: row.totalCostUsd,
                              currency: costCurrency,
                              usdToInr,
                            })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase">
              <tr>
                <th className="py-3 text-left">Date</th>
                <th className="py-3 text-right">Chat</th>
                <th className="py-3 text-right">Embeddings</th>
                <th className="py-3 text-right">Total</th>
                <th className="py-3 text-right">Other usage</th>
              </tr>
            </thead>
            <tbody>
              {costDailyRows.length === 0 ? (
                <tr>
                  <td
                    className="py-6 text-center text-muted-foreground"
                    colSpan={5}
                  >
                    No daily cost data found for the selected range.
                  </td>
                </tr>
              ) : (
                costDailyRows.map((row) => (
                  <tr className="border-t text-sm" key={row.date}>
                    <td className="py-2">{row.date}</td>
                    <td className="py-2 text-right">
                      {formatCostInCurrency({
                        valueUsd: row.chatCostUsd,
                        currency: costCurrency,
                        usdToInr,
                      })}
                    </td>
                    <td className="py-2 text-right">
                      {formatCostInCurrency({
                        valueUsd: row.embeddingCostUsd,
                        currency: costCurrency,
                        usdToInr,
                      })}
                    </td>
                    <td className="py-2 text-right font-medium">
                      {formatCostInCurrency({
                        valueUsd: row.totalCostUsd,
                        currency: costCurrency,
                        usdToInr,
                      })}
                    </td>
                    <td className="py-2 text-right">
                      {formatNumber(row.otherUsageCount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {otherUsageRows.length > 0 ? (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="py-3 text-left">Tracked usage</th>
                  <th className="py-3 text-right">Events</th>
                  <th className="py-3 text-right">Tokens</th>
                  <th className="py-3 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {otherUsageRows.map((row) => (
                  <tr className="border-t text-sm" key={row.featureKey}>
                    <td className="py-2 font-medium">{row.featureLabel}</td>
                    <td className="py-2 text-right">
                      {formatNumber(row.usageCount)}
                    </td>
                    <td className="py-2 text-right">
                      {formatNumber(row.totalTokens)}
                    </td>
                    <td className="py-2 text-muted-foreground text-xs">
                      {row.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {summaryCards.map((card) => (
          <article
            className="flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm"
            key={card.title}
          >
            <span className="font-medium text-muted-foreground text-sm">
              {card.title}
            </span>
            <span className="font-semibold text-lg">{card.value}</span>
            {card.description ? (
              <p className="text-muted-foreground text-xs leading-relaxed">
                {card.description}
              </p>
            ) : null}
          </article>
        ))}
      </section>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-lg">Chat profit log</h2>
            <p className="text-muted-foreground text-sm">
              Revenue and provider cost for each chat transcript.
            </p>
          </div>
        </div>

        <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
          <PreservedSearchParamsInputs
            exclude={["from", "to", "page", "pageSize"]}
            searchParams={resolvedSearchParams}
          />
          <div className="flex flex-col">
            <label
              className="font-medium text-muted-foreground text-xs"
              htmlFor="from"
            >
              From
            </label>
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              defaultValue={from ? format(from, "yyyy-MM-dd") : ""}
              id="from"
              name="from"
              type="date"
            />
          </div>
          <div className="flex flex-col">
            <label
              className="font-medium text-muted-foreground text-xs"
              htmlFor="to"
            >
              To
            </label>
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              defaultValue={to ? format(to, "yyyy-MM-dd") : ""}
              id="to"
              name="to"
              type="date"
            />
          </div>
          <div className="flex flex-col">
            <label
              className="font-medium text-muted-foreground text-xs"
              htmlFor="pageSize"
            >
              Rows per page
            </label>
            <input
              className="w-28 rounded-md border bg-background px-3 py-2 text-sm"
              defaultValue={pageSize}
              id="pageSize"
              max={MAX_PAGE_SIZE}
              min={1}
              name="pageSize"
              type="number"
            />
          </div>
          <input name="page" type="hidden" value="1" />
          <Button type="submit" variant="secondary">
            Apply filters
          </Button>
        </form>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-muted-foreground text-sm">
            Showing {chatRows.length} of {chatSummaries.total} chats
          </div>
          <ExportButton rows={chatExportRows} />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase">
              <tr>
                <th className="py-3 text-left">Date</th>
                <th className="py-3 text-left">Chat ID</th>
                <th className="py-3 text-left">User</th>
                <th className="py-3 text-right">Credits (in/out tokens)</th>
                <th className="py-3 text-right">User charge</th>
                <th className="py-3 text-right">Provider cost</th>
                <th className="py-3 text-right">Profit (INR)</th>
              </tr>
            </thead>
            <tbody>
              {chatRows.length === 0 ? (
                <tr>
                  <td
                    className="py-6 text-center text-muted-foreground"
                    colSpan={7}
                  >
                    No chat usage found for the selected range.
                  </td>
                </tr>
              ) : (
                chatRows.map((row) => {
                  const dateLabel = row.createdAt
                    ? format(row.createdAt, "PPpp")
                    : "—";
                  return (
                    <tr
                      className="border-t text-sm"
                      key={`${row.chatId}-${dateLabel}`}
                    >
                      <td className="py-2">{dateLabel}</td>
                      <td className="py-2 font-mono text-xs">
                        {row.chatId.slice(0, 12)}
                      </td>
                      <td className="py-2">{row.userEmail}</td>
                      <td className="py-2 text-right">
                        <div className="flex flex-col items-end">
                          <span>{formatNumber(row.credits, 2)}</span>
                          <span className="text-muted-foreground text-xs">
                            ({formatNumber(row.inputTokens)} in /{" "}
                            {formatNumber(row.outputTokens)} out)
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
                          <span>
                            {formatCurrency(row.providerCostInr, "INR")}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {formatCurrency(row.providerCostUsd, "USD")}
                          </span>
                        </div>
                      </td>
                      <td
                        className={cn(
                          "py-2 text-right font-medium",
                          row.profitInr < 0
                            ? "text-destructive"
                            : "text-emerald-600"
                        )}
                      >
                        {formatCurrency(row.profitInr, "INR")}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <PaginationLink
              direction="prev"
              disabled={page <= 1}
              label="Previous"
              page={page - 1}
              searchParams={resolvedSearchParams}
            />
            <PaginationLink
              direction="next"
              disabled={page >= totalPages}
              label="Next"
              page={page + 1}
              searchParams={resolvedSearchParams}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-lg">Recharge log</h2>
            <p className="text-muted-foreground text-sm">
              Breakdown of every successful top-up and the current subscription
              expiry.
            </p>
          </div>
          <RechargeExportButton rows={rechargeExportRows} />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase">
              <tr>
                <th className="py-3 text-left">Date</th>
                <th className="py-3 text-left">Order ID</th>
                <th className="py-3 text-left">User</th>
                <th className="py-3 text-left">Plan</th>
                <th className="py-3 text-right">Amount</th>
                <th className="py-3 text-right">Currency</th>
                <th className="py-3 text-left">Subscription expires</th>
              </tr>
            </thead>
            <tbody>
              {rechargeRows.length === 0 ? (
                <tr>
                  <td
                    className="py-6 text-center text-muted-foreground"
                    colSpan={7}
                  >
                    No paid recharges found for the selected range.
                  </td>
                </tr>
              ) : (
                rechargeRows.map((row) => (
                  <tr
                    className="border-t text-sm"
                    key={`${row.orderId}-${row.createdAt.toISOString()}`}
                  >
                    <td className="py-2">{format(row.createdAt, "PPpp")}</td>
                    <td className="py-2 font-mono text-xs">
                      {row.orderId.slice(0, 16)}
                    </td>
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
                    <td className="py-2">
                      {row.expiresAt ? format(row.expiresAt, "PPpp") : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            Page {page} of {rechargeTotalPages}
          </span>
          <div className="flex items-center gap-2">
            <PaginationLink
              direction="prev"
              disabled={page <= 1}
              label="Previous"
              page={page - 1}
              searchParams={resolvedSearchParams}
            />
            <PaginationLink
              direction="next"
              disabled={page >= rechargeTotalPages}
              label="Next"
              page={page + 1}
              searchParams={resolvedSearchParams}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-lg">Model pricing summary</h2>
            <p className="text-muted-foreground text-sm">
              User pricing versus provider cost per one million tokens.
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase">
              <tr>
                <th className="py-3 text-left">Model</th>
                <th className="py-3 text-left">Provider</th>
                <th className="py-3 text-left">User charge</th>
                <th className="py-3 text-left">Provider cost</th>
                <th className="py-3 text-left">Profit per 1M</th>
                <th className="py-3 text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {modelRows.length === 0 ? (
                <tr>
                  <td
                    className="py-6 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    No model pricing information available.
                  </td>
                </tr>
              ) : (
                modelRows.map((row) => {
                  const userInputInr = row.userInputUsd * usdToInr;
                  const userOutputInr = row.userOutputUsd * usdToInr;
                  const providerInputInr = row.providerInputUsd * usdToInr;
                  const providerOutputInr = row.providerOutputUsd * usdToInr;
                  const totalUserInr = row.totalUserUsd * usdToInr;
                  const totalProviderInr = row.totalProviderUsd * usdToInr;

                  return (
                    <tr className="border-t text-sm" key={row.id}>
                      <td className="py-2">
                        <div className="flex flex-col">
                          <span>{row.name}</span>
                          {row.enabled ? null : (
                            <span className="text-muted-foreground text-xs">
                              Disabled
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 capitalize">{row.provider}</td>
                      <td className="py-2 text-muted-foreground text-xs">
                        <div>
                          Input: {formatCurrency(row.userInputUsd, "USD")} (
                          {formatCurrency(userInputInr, "INR")})
                        </div>
                        <div>
                          Output: {formatCurrency(row.userOutputUsd, "USD")} (
                          {formatCurrency(userOutputInr, "INR")})
                        </div>
                        <div>
                          Total: {formatCurrency(row.totalUserUsd, "USD")} (
                          {formatCurrency(totalUserInr, "INR")})
                        </div>
                      </td>
                      <td className="py-2 text-muted-foreground text-xs">
                        <div>
                          Input: {formatCurrency(row.providerInputUsd, "USD")} (
                          {formatCurrency(providerInputInr, "INR")})
                        </div>
                        <div>
                          Output: {formatCurrency(row.providerOutputUsd, "USD")}{" "}
                          ({formatCurrency(providerOutputInr, "INR")})
                        </div>
                        <div>
                          Total: {formatCurrency(row.totalProviderUsd, "USD")} (
                          {formatCurrency(totalProviderInr, "INR")})
                        </div>
                      </td>
                      <td className="py-2 text-muted-foreground text-xs">
                        <div>{formatCurrency(row.profitUsd, "USD")}</div>
                        <div>{formatCurrency(row.profitInr, "INR")}</div>
                      </td>
                      <td className="py-2 text-right font-medium">
                        {Number.isFinite(row.marginPercent)
                          ? `${row.marginPercent.toFixed(2)}%`
                          : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
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
      if (typeof value === "string") {
        params.set(key, value);
      }
    }
  }
  params.set("page", String(page));

  if (disabled) {
    return (
      <span className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-muted-foreground">
        {label}
      </span>
    );
  }

  return (
    <Link
      className="flex items-center gap-1 rounded-md border px-3 py-1.5 transition hover:bg-muted"
      href={`?${params.toString()}`}
    >
      {label}
    </Link>
  );
}
