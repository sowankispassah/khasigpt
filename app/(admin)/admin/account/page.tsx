import { format } from "date-fns";
import Link from "next/link";
import { type ReactNode, Suspense } from "react";
import { InlineExpandableRows } from "@/components/admin/inline-expandable-rows";
import { Button } from "@/components/ui/button";
import { TOKENS_PER_CREDIT } from "@/lib/constants";
import {
  type ChatFinancialSummary,
  getAdminApiCostBreakdown,
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
type ChatSummariesResult = Awaited<ReturnType<typeof listChatFinancialSummaries>>;
type RechargeSummariesResult = Awaited<ReturnType<typeof listPaidRechargeTotals>>;
type RechargeRecordsResult = Awaited<ReturnType<typeof listRechargeRecords>>;
type CostBreakdownResult = Awaited<ReturnType<typeof getAdminApiCostBreakdown>>;

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;
const DEFAULT_SECTION_PREVIEW_ROWS = 5;

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

function buildSummaryCards(params: {
  totalRechargeUsd: number;
  totalRechargeInr: number;
  totalProviderCostUsd: number;
  usdToInr: number;
  chatCount: number;
}): MetricCard[] {
  const totalProviderCostInr = params.totalProviderCostUsd * params.usdToInr;
  const netProfitInr = params.totalRechargeInr - totalProviderCostInr;
  const avgProfitInr = params.chatCount > 0 ? netProfitInr / params.chatCount : 0;

  return [
    {
      title: "Total recharged",
      value: `${formatCurrency(params.totalRechargeUsd, "USD")} / ${formatCurrency(params.totalRechargeInr, "INR")}`,
      description: "All-time amount users have successfully paid.",
    },
    {
      title: "Provider cost",
      value: `${formatCurrency(params.totalProviderCostUsd, "USD")} / ${formatCurrency(totalProviderCostInr, "INR")}`,
      description: "Estimated spend to the underlying model providers.",
    },
    {
      title: "Net profit",
      value: formatCurrency(netProfitInr, "INR"),
      description: `Average per chat: ${formatCurrency(avgProfitInr, "INR")}`,
    },
  ];
}

function mapChatRows(records: ChatFinancialSummary[], usdToInr: number): ChatProfitRow[] {
  return records.map((record) => {
    const createdAt = record.chatCreatedAt ?? record.usageStartedAt ?? null;
    const totalTokens = record.totalInputTokens + record.totalOutputTokens;
    return {
      chatId: record.chatId ?? "(unknown)",
      userEmail: record.email ?? "Unknown user",
      createdAt,
      inputTokens: record.totalInputTokens,
      outputTokens: record.totalOutputTokens,
      credits: totalTokens / TOKENS_PER_CREDIT,
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

function mapModelPricingRows(configs: ModelConfig[], usdToInr: number): ModelPricingRow[] {
  return configs.map((config) => {
    const providerInputUsd = Number(config.inputProviderCostPerMillion ?? 0);
    const providerOutputUsd = Number(config.outputProviderCostPerMillion ?? 0);
    const totalProviderUsd = providerInputUsd + providerOutputUsd;
    return {
      id: config.id,
      name: config.displayName,
      provider: config.provider,
      userInputUsd: 0,
      userOutputUsd: 0,
      providerInputUsd,
      providerOutputUsd,
      totalUserUsd: 0,
      totalProviderUsd,
      profitUsd: -totalProviderUsd,
      profitInr: -totalProviderUsd * usdToInr,
      marginPercent: 0,
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

function AccountSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="rounded-lg border bg-card shadow-sm">
      <summary className="cursor-pointer list-none px-4 py-4 font-semibold text-lg [&::-webkit-details-marker]:hidden">
        {title}
      </summary>
      <div className="border-t p-4">{children}</div>
    </details>
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

function MobileCard({
  title,
  children,
  eyebrow,
}: {
  title: string;
  children: ReactNode;
  eyebrow?: string;
}) {
  return (
    <article className="rounded-lg border bg-background p-4">
      {eyebrow ? (
        <div className="text-muted-foreground text-xs uppercase tracking-wide">
          {eyebrow}
        </div>
      ) : null}
      <div className="mt-1 font-medium text-sm">{title}</div>
      <div className="mt-3 space-y-2 text-sm">{children}</div>
    </article>
  );
}

function MobileMetaRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-right text-sm">{value}</span>
    </div>
  );
}

function renderCostFeatureRow(
  row: Awaited<ReturnType<typeof getAdminApiCostBreakdown>>["featureSummaries"][number],
  currency: CostCurrency,
  usdToInr: number
) {
  const usageLabel =
    row.featureKey === "chat_completions"
      ? `${formatNumber(row.usageCount)} usage rows, ${formatNumber(
          row.inputTokens
        )} in / ${formatNumber(row.outputTokens)} out`
      : row.featureKey === "embeddings"
        ? `${formatNumber(row.indexedEntries)} indexed entries, ${formatNumber(
            row.indexedChars
          )} chars`
        : `${formatNumber(row.usageCount)} events, ${formatNumber(
            row.inputTokens
          )} tokens`;

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

function _renderCostFeatureCard(
  row: Awaited<ReturnType<typeof getAdminApiCostBreakdown>>["featureSummaries"][number],
  currency: CostCurrency,
  usdToInr: number
) {
  const usageLabel =
    row.featureKey === "chat_completions"
      ? `${formatNumber(row.usageCount)} rows, ${formatNumber(
          row.inputTokens
        )} in / ${formatNumber(row.outputTokens)} out`
      : row.featureKey === "embeddings"
        ? `${formatNumber(row.indexedEntries)} entries, ${formatNumber(
            row.indexedChars
          )} chars`
        : `${formatNumber(row.usageCount)} events, ${formatNumber(
            row.inputTokens
          )} tokens`;

  return (
    <MobileCard key={row.featureKey} title={row.featureLabel} eyebrow={row.method}>
      <MobileMetaRow label="Usage" value={usageLabel} />
      <MobileMetaRow label="Models" value={formatNumber(row.modelCount)} />
      <MobileMetaRow
        label="Cost"
        value={
          row.totalCostUsd === null
            ? "-"
            : formatCostInCurrency(row.totalCostUsd, currency, usdToInr)
        }
      />
      <div className="text-muted-foreground text-xs">{row.note ?? "-"}</div>
    </MobileCard>
  );
}

function renderCostModelRow(
  row: Awaited<ReturnType<typeof getAdminApiCostBreakdown>>["modelSummaries"][number],
  currency: CostCurrency,
  usdToInr: number
) {
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

function _renderCostModelCard(
  row: Awaited<ReturnType<typeof getAdminApiCostBreakdown>>["modelSummaries"][number],
  currency: CostCurrency,
  usdToInr: number
) {
  const usageLabel =
    row.featureKey === "chat_completions"
      ? `${formatNumber(row.usageCount)} rows, ${formatNumber(
          row.inputTokens
        )} in / ${formatNumber(row.outputTokens)} out`
      : `${formatNumber(row.indexedEntries)} entries, ${formatNumber(
          row.indexedChars
        )} chars`;

  return (
    <MobileCard key={row.modelKey} title={row.modelLabel} eyebrow={row.featureLabel}>
      <MobileMetaRow label="Provider" value={row.providerLabel ?? "-"} />
      <MobileMetaRow label="Method" value={row.method.replaceAll("_", " ")} />
      <MobileMetaRow label="Usage" value={usageLabel} />
      <MobileMetaRow
        label="Cost"
        value={
          row.totalCostUsd === null
            ? "-"
            : formatCostInCurrency(row.totalCostUsd, currency, usdToInr)
        }
      />
    </MobileCard>
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
        {formatCostInCurrency(row.embeddingCostUsd, currency, usdToInr)}
      </td>
      <td className="py-2 text-right font-medium">
        {formatCostInCurrency(row.totalCostUsd, currency, usdToInr)}
      </td>
      <td className="py-2 text-right">{formatNumber(row.otherUsageCount)}</td>
    </tr>
  );
}

function _renderDailyCostCard(
  row: Awaited<ReturnType<typeof getAdminApiCostBreakdown>>["dailySummaries"][number],
  currency: CostCurrency,
  usdToInr: number
) {
  return (
    <MobileCard key={row.date} title={row.date}>
      <MobileMetaRow
        label="Chat"
        value={formatCostInCurrency(row.chatCostUsd, currency, usdToInr)}
      />
      <MobileMetaRow
        label="Embeddings"
        value={formatCostInCurrency(row.embeddingCostUsd, currency, usdToInr)}
      />
      <MobileMetaRow
        label="Total"
        value={formatCostInCurrency(row.totalCostUsd, currency, usdToInr)}
      />
      <MobileMetaRow
        label="Other usage"
        value={formatNumber(row.otherUsageCount)}
      />
    </MobileCard>
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

function _renderOtherUsageCard(
  row: Awaited<ReturnType<typeof getAdminApiCostBreakdown>>["otherUsageSummaries"][number]
) {
  return (
    <MobileCard key={row.featureKey} title={row.featureLabel}>
      <MobileMetaRow label="Events" value={formatNumber(row.usageCount)} />
      <MobileMetaRow label="Tokens" value={formatNumber(row.totalTokens)} />
      <div className="text-muted-foreground text-xs">{row.note}</div>
    </MobileCard>
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

function _renderChatProfitCard(row: ChatProfitRow) {
  const dateLabel = row.createdAt ? format(row.createdAt, "PPpp") : "-";
  return (
    <MobileCard key={`${row.chatId}-${dateLabel}`} title={row.userEmail} eyebrow={dateLabel}>
      <MobileMetaRow label="Chat" value={<span className="font-mono text-xs">{row.chatId.slice(0, 12)}</span>} />
      <MobileMetaRow label="Credits" value={formatNumber(row.credits, 2)} />
      <MobileMetaRow
        label="Tokens"
        value={`${formatNumber(row.inputTokens)} in / ${formatNumber(row.outputTokens)} out`}
      />
      <MobileMetaRow
        label="Charge"
        value={
          row.isFreeUsage ? "Free credits" : formatCurrency(row.chargeInr, "INR")
        }
      />
      <MobileMetaRow
        label="Provider cost"
        value={formatCurrency(row.providerCostInr, "INR")}
      />
      <MobileMetaRow label="Profit" value={formatCurrency(row.profitInr, "INR")} />
    </MobileCard>
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
    </tr>
  );
}

function _renderRechargeCard(row: RechargeTableRow) {
  return (
    <MobileCard
      key={`${row.orderId}-${row.createdAt.toISOString()}`}
      title={row.userEmail}
      eyebrow={format(row.createdAt, "PPpp")}
    >
      <MobileMetaRow label="Order" value={<span className="font-mono text-xs">{row.orderId.slice(0, 16)}</span>} />
      <MobileMetaRow label="Plan" value={row.planName} />
      <MobileMetaRow label="Amount" value={formatCurrency(row.amountInr, "INR")} />
      <MobileMetaRow label="Currency" value={row.currency} />
      <MobileMetaRow
        label="Expires"
        value={row.expiresAt ? format(row.expiresAt, "PPpp") : "-"}
      />
    </MobileCard>
  );
}

function renderModelPricingRow(row: ModelPricingRow, usdToInr: number) {
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
            <span className="text-muted-foreground text-xs">Disabled</span>
          )}
        </div>
      </td>
      <td className="py-2 capitalize">{row.provider}</td>
      <td className="py-2 text-muted-foreground text-xs">
        <div>
          Input: {formatCurrency(row.userInputUsd, "USD")} ({formatCurrency(userInputInr, "INR")})
        </div>
        <div>
          Output: {formatCurrency(row.userOutputUsd, "USD")} ({formatCurrency(userOutputInr, "INR")})
        </div>
        <div>
          Total: {formatCurrency(row.totalUserUsd, "USD")} ({formatCurrency(totalUserInr, "INR")})
        </div>
      </td>
      <td className="py-2 text-muted-foreground text-xs">
        <div>
          Input: {formatCurrency(row.providerInputUsd, "USD")} ({formatCurrency(providerInputInr, "INR")})
        </div>
        <div>
          Output: {formatCurrency(row.providerOutputUsd, "USD")} ({formatCurrency(providerOutputInr, "INR")})
        </div>
        <div>
          Total: {formatCurrency(row.totalProviderUsd, "USD")} ({formatCurrency(totalProviderInr, "INR")})
        </div>
      </td>
      <td className="py-2 text-muted-foreground text-xs">
        <div>{formatCurrency(row.profitUsd, "USD")}</div>
        <div>{formatCurrency(row.profitInr, "INR")}</div>
      </td>
      <td className="py-2 text-right font-medium">
        {Number.isFinite(row.marginPercent) ? `${row.marginPercent.toFixed(2)}%` : "-"}
      </td>
    </tr>
  );
}

function _renderModelPricingCard(row: ModelPricingRow, usdToInr: number) {
  const totalProviderInr = row.totalProviderUsd * usdToInr;
  return (
    <MobileCard key={row.id} title={row.name} eyebrow={row.provider}>
      <MobileMetaRow
        label="Provider cost"
        value={`${formatCurrency(row.totalProviderUsd, "USD")} / ${formatCurrency(totalProviderInr, "INR")}`}
      />
      <MobileMetaRow label="Profit" value={formatCurrency(row.profitInr, "INR")} />
      <MobileMetaRow
        label="Margin"
        value={Number.isFinite(row.marginPercent) ? `${row.marginPercent.toFixed(2)}%` : "-"}
      />
      {!row.enabled ? (
        <div className="text-muted-foreground text-xs">Disabled</div>
      ) : null}
    </MobileCard>
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

  const usdToInrPromise = getUsdToInrRate().then((result) => result.rate);
  const costBreakdownPromise = getAdminApiCostBreakdown({
    range: costFrom || costTo ? { start: costFrom, end: costTo } : undefined,
  });
  const chatSummariesPromise = listChatFinancialSummaries({
    range: { start: from, end: to },
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const rechargeSummariesPromise = listPaidRechargeTotals();
  const rechargeRecordsPromise = listRechargeRecords({
    range: { start: from, end: to },
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const modelConfigsPromise = listModelConfigs({
    includeDeleted: false,
    includeDisabled: true,
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl">Per-chat profit</h1>
        <p className="text-muted-foreground text-sm">
          Track revenue, provider cost, and margin for each chat session.
        </p>
      </header>

      <Suspense fallback={<AccountOverviewFallback />}>
        <AccountOverviewSection
          chatSummariesPromise={chatSummariesPromise}
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

async function _LegacyAdminAccountPage({
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
    Math.max(1, Number.parseInt(resolvedSearchParams?.pageSize ?? String(DEFAULT_PAGE_SIZE), 10)),
    MAX_PAGE_SIZE
  );

  const [
    { rate: usdToInr },
    costBreakdown,
    chatSummaries,
    rechargeSummaries,
    rechargeRecords,
    modelConfigs,
  ] = await Promise.all([
    getUsdToInrRate(),
    getAdminApiCostBreakdown({
      range: costFrom || costTo ? { start: costFrom, end: costTo } : undefined,
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

  const chatRows = mapChatRows(chatSummaries.records, usdToInr);
  const rechargeRows = mapRechargeRows(rechargeRecords.records, usdToInr);
  const modelRows = mapModelPricingRows(modelConfigs, usdToInr);
  const { totalUsd: totalRechargeUsd, totalInr: totalRechargeInr } =
    aggregateRechargeTotals(rechargeSummaries, usdToInr);
  const summaryCards = buildSummaryCards({
    totalRechargeUsd,
    totalRechargeInr,
    totalProviderCostUsd: chatSummaries.totals.providerCostUsd,
    usdToInr,
    chatCount: chatSummaries.total,
  });

  const { preview: costFeatureRowsPreview, overflow: costFeatureRowsOverflow } =
    splitPreviewRows(costBreakdown.featureSummaries);
  const { preview: costModelRowsPreview, overflow: costModelRowsOverflow } =
    splitPreviewRows(costBreakdown.modelSummaries);
  const { preview: costDailyRowsPreview, overflow: costDailyRowsOverflow } =
    splitPreviewRows(costBreakdown.dailySummaries);
  const { preview: otherUsageRowsPreview, overflow: otherUsageRowsOverflow } =
    splitPreviewRows(costBreakdown.otherUsageSummaries);
  const { preview: chatRowsPreview, overflow: chatRowsOverflow } =
    splitPreviewRows(chatRows);
  const { preview: rechargeRowsPreview, overflow: rechargeRowsOverflow } =
    splitPreviewRows(rechargeRows);
  const { preview: modelRowsPreview, overflow: modelRowsOverflow } =
    splitPreviewRows(modelRows);

  const totalPages = Math.max(1, Math.ceil(chatSummaries.total / pageSize));
  const rechargeTotalPages = Math.max(
    1,
    Math.ceil(rechargeRecords.total / pageSize)
  );

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
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl">Per-chat profit</h1>
        <p className="text-muted-foreground text-sm">
          Track revenue, provider cost, and margin for each chat session.
        </p>
      </header>

      <AccountSection title="Cost">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-3xl text-muted-foreground text-sm">
            API cost dashboard by feature, model, and day. Chat completion costs are exact. Embedding costs are estimated from indexed content size. Other tracked usage is shown separately when historical provider cost is unavailable.
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
          <article className="rounded-lg border bg-background p-4"><div className="font-medium text-muted-foreground text-sm">Total cost</div><div className="mt-2 font-semibold text-lg">{formatCostInCurrency(costBreakdown.totalCostUsd, costCurrency, usdToInr)}</div><div className="mt-1 text-muted-foreground text-xs">Selected range</div></article>
          <article className="rounded-lg border bg-background p-4"><div className="font-medium text-muted-foreground text-sm">Exact tracked cost</div><div className="mt-2 font-semibold text-lg">{formatCostInCurrency(costBreakdown.exactCostUsd, costCurrency, usdToInr)}</div><div className="mt-1 text-muted-foreground text-xs">Chat completion token usage</div></article>
          <article className="rounded-lg border bg-background p-4"><div className="font-medium text-muted-foreground text-sm">Estimated embedding cost</div><div className="mt-2 font-semibold text-lg">{formatCostInCurrency(costBreakdown.estimatedCostUsd, costCurrency, usdToInr)}</div><div className="mt-1 text-muted-foreground text-xs">File Search and index updates</div></article>
          <article className="rounded-lg border bg-background p-4"><div className="font-medium text-muted-foreground text-sm">Other tracked usage</div><div className="mt-2 font-semibold text-lg">{formatNumber(costBreakdown.otherUsageSummaries.reduce((total, row) => total + row.usageCount, 0))}</div><div className="mt-1 text-muted-foreground text-xs">Tracked events without stored provider cost</div></article>
        </div>

        <div className="mt-6 flex flex-col gap-4">
          <SubsectionPanel title="Cost by feature">
            <div className="overflow-x-auto">
              <table className="w-max min-w-[920px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
                <thead className="text-muted-foreground text-xs uppercase"><tr><th className="py-3 text-left">Feature</th><th className="py-3 text-left">Method</th><th className="py-3 text-left">Usage</th><th className="py-3 text-right">Models</th><th className="py-3 text-right">Cost</th><th className="py-3 text-left">Notes</th></tr></thead>
                <tbody>{costBreakdown.featureSummaries.length === 0 ? <tr><td className="py-6 text-center text-muted-foreground" colSpan={6}>No API cost data found for the selected range.</td></tr> : <InlineExpandableRows colSpan={6} overflowRows={costFeatureRowsOverflow.map((row) => renderCostFeatureRow(row, costCurrency, usdToInr))} previewRows={costFeatureRowsPreview.map((row) => renderCostFeatureRow(row, costCurrency, usdToInr))} />}</tbody>
              </table>
            </div>
          </SubsectionPanel>

          <SubsectionPanel title="Cost by model">
            <div className="overflow-x-auto">
              <table className="w-max min-w-[920px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
                <thead className="text-muted-foreground text-xs uppercase"><tr><th className="py-3 text-left">Feature</th><th className="py-3 text-left">Model</th><th className="py-3 text-left">Provider</th><th className="py-3 text-left">Method</th><th className="py-3 text-left">Usage</th><th className="py-3 text-right">Cost</th></tr></thead>
                <tbody>{costBreakdown.modelSummaries.length === 0 ? <tr><td className="py-6 text-center text-muted-foreground" colSpan={6}>No per-model cost data found for the selected range.</td></tr> : <InlineExpandableRows colSpan={6} overflowRows={costModelRowsOverflow.map((row) => renderCostModelRow(row, costCurrency, usdToInr))} previewRows={costModelRowsPreview.map((row) => renderCostModelRow(row, costCurrency, usdToInr))} />}</tbody>
              </table>
            </div>
          </SubsectionPanel>

          <SubsectionPanel title="Daily cost trend">
            <div className="overflow-x-auto">
              <table className="w-max min-w-[760px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
                <thead className="text-muted-foreground text-xs uppercase"><tr><th className="py-3 text-left">Date</th><th className="py-3 text-right">Chat</th><th className="py-3 text-right">Embeddings</th><th className="py-3 text-right">Total</th><th className="py-3 text-right">Other usage</th></tr></thead>
                <tbody>{costBreakdown.dailySummaries.length === 0 ? <tr><td className="py-6 text-center text-muted-foreground" colSpan={5}>No daily cost data found for the selected range.</td></tr> : <InlineExpandableRows colSpan={5} overflowRows={costDailyRowsOverflow.map((row) => renderDailyCostRow(row, costCurrency, usdToInr))} previewRows={costDailyRowsPreview.map((row) => renderDailyCostRow(row, costCurrency, usdToInr))} />}</tbody>
              </table>
            </div>
          </SubsectionPanel>

          <SubsectionPanel title="Tracked other API usage">
            <div className="overflow-x-auto">
              <table className="w-max min-w-[720px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
                <thead className="text-muted-foreground text-xs uppercase"><tr><th className="py-3 text-left">Tracked usage</th><th className="py-3 text-right">Events</th><th className="py-3 text-right">Tokens</th><th className="py-3 text-left">Notes</th></tr></thead>
                <tbody>{costBreakdown.otherUsageSummaries.length === 0 ? <tr><td className="py-6 text-center text-muted-foreground" colSpan={4}>No other tracked API usage found for the selected range.</td></tr> : <InlineExpandableRows colSpan={4} overflowRows={otherUsageRowsOverflow.map((row) => renderOtherUsageRow(row))} previewRows={otherUsageRowsPreview.map((row) => renderOtherUsageRow(row))} />}</tbody>
              </table>
            </div>
          </SubsectionPanel>
        </div>
      </AccountSection>

      <AccountSection title="Overview">
          <div className="grid gap-4 md:grid-cols-3">
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

      <AccountSection title="Chat profit log">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              Revenue and provider cost for each chat transcript.
            </p>
            <ExportButton rows={chatExportRows} />
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

          <div className="mt-4 text-muted-foreground text-sm">
            Showing {chatRows.length} of {chatSummaries.total} chats
          </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-max min-w-[980px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
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
                  <InlineExpandableRows
                    colSpan={7}
                    overflowRows={chatRowsOverflow.map((row) =>
                      renderChatProfitRow(row)
                    )}
                    previewRows={chatRowsPreview.map((row) =>
                      renderChatProfitRow(row)
                    )}
                  />
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
        </AccountSection>

      <AccountSection title="Recharge log">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              Breakdown of every successful top-up and the current subscription
              expiry.
            </p>
            <RechargeExportButton rows={rechargeExportRows} />
          </div>

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
                  <InlineExpandableRows
                    colSpan={7}
                    overflowRows={rechargeRowsOverflow.map((row) =>
                      renderRechargeRow(row)
                    )}
                    previewRows={rechargeRowsPreview.map((row) =>
                      renderRechargeRow(row)
                    )}
                  />
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
        </AccountSection>

      <AccountSection title="Model pricing summary">
          <p className="text-muted-foreground text-sm">
            User pricing versus provider cost per one million tokens.
          </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-max min-w-[980px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
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
                  <InlineExpandableRows
                    colSpan={6}
                    overflowRows={modelRowsOverflow.map((row) =>
                      renderModelPricingRow(row, usdToInr)
                    )}
                    previewRows={modelRowsPreview.map((row) =>
                      renderModelPricingRow(row, usdToInr)
                    )}
                  />
                )}
              </tbody>
            </table>
          </div>
      </AccountSection>
    </div>
  );
}

async function AccountOverviewSection({
  chatSummariesPromise,
  rechargeSummariesPromise,
  usdToInrPromise,
}: {
  chatSummariesPromise: Promise<ChatSummariesResult>;
  rechargeSummariesPromise: Promise<RechargeSummariesResult>;
  usdToInrPromise: Promise<number>;
}) {
  const [chatSummaries, rechargeSummaries, usdToInr] = await Promise.all([
    chatSummariesPromise,
    rechargeSummariesPromise,
    usdToInrPromise,
  ]);
  const { totalUsd: totalRechargeUsd, totalInr: totalRechargeInr } =
    aggregateRechargeTotals(rechargeSummaries, usdToInr);
  const summaryCards = buildSummaryCards({
    totalRechargeUsd,
    totalRechargeInr,
    totalProviderCostUsd: chatSummaries.totals.providerCostUsd,
    usdToInr,
    chatCount: chatSummaries.total,
  });

  return (
    <AccountSection title="Overview">
      <div className="grid gap-4 md:grid-cols-3">
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
  costBreakdownPromise: Promise<CostBreakdownResult>;
  costCurrency: CostCurrency;
  costFrom: Date | undefined;
  costTo: Date | undefined;
  resolvedSearchParams: SearchParams | undefined;
  usdToInrPromise: Promise<number>;
}) {
  const [costBreakdown, usdToInr] = await Promise.all([
    costBreakdownPromise,
    usdToInrPromise,
  ]);
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
          API cost dashboard by feature, model, and day. Chat completion costs are exact. Embedding costs are estimated from indexed content size. Other tracked usage is shown separately when historical provider cost is unavailable.
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
        <article className="rounded-lg border bg-background p-4"><div className="font-medium text-muted-foreground text-sm">Total cost</div><div className="mt-2 font-semibold text-lg">{formatCostInCurrency(costBreakdown.totalCostUsd, costCurrency, usdToInr)}</div><div className="mt-1 text-muted-foreground text-xs">Selected range</div></article>
        <article className="rounded-lg border bg-background p-4"><div className="font-medium text-muted-foreground text-sm">Exact tracked cost</div><div className="mt-2 font-semibold text-lg">{formatCostInCurrency(costBreakdown.exactCostUsd, costCurrency, usdToInr)}</div><div className="mt-1 text-muted-foreground text-xs">Chat completion token usage</div></article>
        <article className="rounded-lg border bg-background p-4"><div className="font-medium text-muted-foreground text-sm">Estimated embedding cost</div><div className="mt-2 font-semibold text-lg">{formatCostInCurrency(costBreakdown.estimatedCostUsd, costCurrency, usdToInr)}</div><div className="mt-1 text-muted-foreground text-xs">File Search and index updates</div></article>
        <article className="rounded-lg border bg-background p-4"><div className="font-medium text-muted-foreground text-sm">Other tracked usage</div><div className="mt-2 font-semibold text-lg">{formatNumber(costBreakdown.otherUsageSummaries.reduce((total, row) => total + row.usageCount, 0))}</div><div className="mt-1 text-muted-foreground text-xs">Tracked events without stored provider cost</div></article>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <SubsectionPanel title="Cost by feature">
          <div className="overflow-x-auto">
            <table className="w-max min-w-[920px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead className="text-muted-foreground text-xs uppercase"><tr><th className="py-3 text-left">Feature</th><th className="py-3 text-left">Method</th><th className="py-3 text-left">Usage</th><th className="py-3 text-right">Models</th><th className="py-3 text-right">Cost</th><th className="py-3 text-left">Notes</th></tr></thead>
              <tbody>{costBreakdown.featureSummaries.length === 0 ? <tr><td className="py-6 text-center text-muted-foreground" colSpan={6}>No API cost data found for the selected range.</td></tr> : <InlineExpandableRows colSpan={6} overflowRows={costFeatureRowsOverflow.map((row) => renderCostFeatureRow(row, costCurrency, usdToInr))} previewRows={costFeatureRowsPreview.map((row) => renderCostFeatureRow(row, costCurrency, usdToInr))} />}</tbody>
            </table>
          </div>
        </SubsectionPanel>

        <SubsectionPanel title="Cost by model">
          <div className="overflow-x-auto">
            <table className="w-max min-w-[920px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead className="text-muted-foreground text-xs uppercase"><tr><th className="py-3 text-left">Feature</th><th className="py-3 text-left">Model</th><th className="py-3 text-left">Provider</th><th className="py-3 text-left">Method</th><th className="py-3 text-left">Usage</th><th className="py-3 text-right">Cost</th></tr></thead>
              <tbody>{costBreakdown.modelSummaries.length === 0 ? <tr><td className="py-6 text-center text-muted-foreground" colSpan={6}>No per-model cost data found for the selected range.</td></tr> : <InlineExpandableRows colSpan={6} overflowRows={costModelRowsOverflow.map((row) => renderCostModelRow(row, costCurrency, usdToInr))} previewRows={costModelRowsPreview.map((row) => renderCostModelRow(row, costCurrency, usdToInr))} />}</tbody>
            </table>
          </div>
        </SubsectionPanel>

        <SubsectionPanel title="Daily cost trend">
          <div className="overflow-x-auto">
            <table className="w-max min-w-[760px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead className="text-muted-foreground text-xs uppercase"><tr><th className="py-3 text-left">Date</th><th className="py-3 text-right">Chat</th><th className="py-3 text-right">Embeddings</th><th className="py-3 text-right">Total</th><th className="py-3 text-right">Other usage</th></tr></thead>
              <tbody>{costBreakdown.dailySummaries.length === 0 ? <tr><td className="py-6 text-center text-muted-foreground" colSpan={5}>No daily cost data found for the selected range.</td></tr> : <InlineExpandableRows colSpan={5} overflowRows={costDailyRowsOverflow.map((row) => renderDailyCostRow(row, costCurrency, usdToInr))} previewRows={costDailyRowsPreview.map((row) => renderDailyCostRow(row, costCurrency, usdToInr))} />}</tbody>
            </table>
          </div>
        </SubsectionPanel>

        <SubsectionPanel title="Tracked other API usage">
          <div className="overflow-x-auto">
            <table className="w-max min-w-[720px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead className="text-muted-foreground text-xs uppercase"><tr><th className="py-3 text-left">Tracked usage</th><th className="py-3 text-right">Events</th><th className="py-3 text-right">Tokens</th><th className="py-3 text-left">Notes</th></tr></thead>
              <tbody>{costBreakdown.otherUsageSummaries.length === 0 ? <tr><td className="py-6 text-center text-muted-foreground" colSpan={4}>No other tracked API usage found for the selected range.</td></tr> : <InlineExpandableRows colSpan={4} overflowRows={otherUsageRowsOverflow.map((row) => renderOtherUsageRow(row))} previewRows={otherUsageRowsPreview.map((row) => renderOtherUsageRow(row))} />}</tbody>
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
  chatSummariesPromise: Promise<ChatSummariesResult>;
  from: Date | undefined;
  page: number;
  pageSize: number;
  resolvedSearchParams: SearchParams | undefined;
  to: Date | undefined;
  usdToInrPromise: Promise<number>;
}) {
  const [chatSummaries, usdToInr] = await Promise.all([
    chatSummariesPromise,
    usdToInrPromise,
  ]);
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
        Showing {chatRows.length} of {chatSummaries.total} chats
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-max min-w-[980px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
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
          Page {page} of {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <PaginationLink direction="prev" disabled={page <= 1} label="Previous" page={page - 1} searchParams={resolvedSearchParams} />
          <PaginationLink direction="next" disabled={page >= totalPages} label="Next" page={page + 1} searchParams={resolvedSearchParams} />
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
  rechargeRecordsPromise: Promise<RechargeRecordsResult>;
  resolvedSearchParams: SearchParams | undefined;
  usdToInrPromise: Promise<number>;
}) {
  const [rechargeRecords, usdToInr] = await Promise.all([
    rechargeRecordsPromise,
    usdToInrPromise,
  ]);
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
            </tr>
          </thead>
          <tbody>
            {rechargeRows.length === 0 ? (
              <tr>
                <td className="py-6 text-center text-muted-foreground" colSpan={7}>
                  No paid recharges found for the selected range.
                </td>
              </tr>
            ) : (
              <InlineExpandableRows
                colSpan={7}
                overflowRows={rechargeRowsOverflow.map((row) => renderRechargeRow(row))}
                previewRows={rechargeRowsPreview.map((row) => renderRechargeRow(row))}
              />
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          Page {page} of {rechargeTotalPages}
        </span>
        <div className="flex items-center gap-2">
          <PaginationLink direction="prev" disabled={page <= 1} label="Previous" page={page - 1} searchParams={resolvedSearchParams} />
          <PaginationLink direction="next" disabled={page >= rechargeTotalPages} label="Next" page={page + 1} searchParams={resolvedSearchParams} />
        </div>
      </div>
    </AccountSection>
  );
}

async function AccountModelPricingSection({
  modelConfigsPromise,
  usdToInrPromise,
}: {
  modelConfigsPromise: Promise<ModelConfig[]>;
  usdToInrPromise: Promise<number>;
}) {
  const [modelConfigs, usdToInr] = await Promise.all([
    modelConfigsPromise,
    usdToInrPromise,
  ]);
  const modelRows = mapModelPricingRows(modelConfigs, usdToInr);
  const { preview: modelRowsPreview, overflow: modelRowsOverflow } =
    splitPreviewRows(modelRows);

  return (
    <AccountSection title="Model pricing summary">
      <p className="text-muted-foreground text-sm">
        User pricing versus provider cost per one million tokens.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-max min-w-[980px] text-sm [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
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
                <td className="py-6 text-center text-muted-foreground" colSpan={6}>
                  No model pricing information available.
                </td>
              </tr>
            ) : (
              <InlineExpandableRows
                colSpan={6}
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
  return <AccountSectionFallback cards={3} rows={0} title="Overview" />;
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
