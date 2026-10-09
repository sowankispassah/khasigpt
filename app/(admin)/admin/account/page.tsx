import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { adminQueryResult } from "@/lib/admin/safe-query";
import {
  getAdminApiCostBreakdown,
  getPartnerPayoutTotals,
  listChatFinancialSummaries,
  listModelConfigs,
  listPaidRechargeTotals,
  listRechargeRecords,
} from "@/lib/db/queries";
import type { ModelConfig } from "@/lib/db/schema";
import { requireAdminPageSession } from "@/lib/security/admin-session";
import {
  getFallbackUsdToInrRate,
  getUsdToInrRate,
} from "@/lib/services/exchange-rate";
import type { DisplayCurrency } from "./account-format";
import {
  ADMIN_ACCOUNT_QUERY_TIMEOUT_MS,
  ChatProfitSection,
  CostTrendSection,
  DEFAULT_PAGE_SIZE,
  describeRange,
  EMPTY_CHAT_SUMMARIES,
  EMPTY_COST_BREAKDOWN,
  EMPTY_PARTNER_PAYOUTS,
  EMPTY_RECHARGE_RECORDS,
  MAX_PAGE_SIZE,
  ModelPricingSection,
  OverviewFallback,
  OverviewSection,
  PAGE_PATH,
  PanelFallback,
  parseDay,
  parsePositiveInt,
  RangeToolbar,
  RechargeSection,
  type RechargeSummariesResult,
  type SearchParams,
} from "./account-sections";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminAccountPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  await requireAdminPageSession();
  const raw = (searchParams ? await searchParams : undefined) ?? {};
  const from = parseDay(raw.from);
  const to = parseDay(raw.to);
  const currency: DisplayCurrency = raw.currency === "USD" ? "USD" : "INR";
  const page = parsePositiveInt(raw.page, 1);
  const rechargePage = parsePositiveInt(raw.rechargePage, 1);
  const pageSize = Math.min(parsePositiveInt(raw.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const range = from || to ? { start: from, end: to } : undefined;
  const params: SearchParams = {
    currency: currency === "USD" ? "USD" : undefined,
    from: from ? raw.from : undefined,
    page: page > 1 ? String(page) : undefined,
    pageSize: raw.pageSize ? String(pageSize) : undefined,
    rechargePage: rechargePage > 1 ? String(rechargePage) : undefined,
    to: to ? raw.to : undefined,
  };

  const usdToInrPromise = adminQueryResult({
    fallback: getFallbackUsdToInrRate(),
    label: "account.usd-to-inr",
    promise: getUsdToInrRate().then((result) => result.rate),
    timeoutMs: 1500,
  });
  const costBreakdownPromise = adminQueryResult({
    fallback: EMPTY_COST_BREAKDOWN,
    label: "account.cost-breakdown",
    promise: getAdminApiCostBreakdown({ range }),
    timeoutMs: ADMIN_ACCOUNT_QUERY_TIMEOUT_MS,
  });
  // Revenue converts USD recharges to INR inside the query, so it waits for
  // the (short-timeout, fallback-backed) exchange rate.
  const chatSummariesPromise = usdToInrPromise.then((rate) =>
    adminQueryResult({
      fallback: EMPTY_CHAT_SUMMARIES,
      label: "account.chat-financial-summaries",
      promise: listChatFinancialSummaries({
        range,
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
    promise: listPaidRechargeTotals(range),
    timeoutMs: ADMIN_ACCOUNT_QUERY_TIMEOUT_MS,
  });
  const partnerPayoutsPromise = usdToInrPromise.then((rate) =>
    adminQueryResult({
      fallback: EMPTY_PARTNER_PAYOUTS,
      label: "account.partner-payouts",
      promise: getPartnerPayoutTotals({ range, usdToInr: rate.data }),
      timeoutMs: ADMIN_ACCOUNT_QUERY_TIMEOUT_MS,
    })
  );
  const rechargeRecordsPromise = adminQueryResult({
    fallback: EMPTY_RECHARGE_RECORDS,
    label: "account.recharge-records",
    promise: listRechargeRecords({
      range,
      limit: pageSize,
      offset: (rechargePage - 1) * pageSize,
    }),
    timeoutMs: ADMIN_ACCOUNT_QUERY_TIMEOUT_MS,
  });
  const modelConfigsPromise = adminQueryResult({
    fallback: [] as ModelConfig[],
    label: "account.model-configs",
    promise: listModelConfigs({ includeDeleted: false, includeDisabled: true }),
    timeoutMs: ADMIN_ACCOUNT_QUERY_TIMEOUT_MS,
  });

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        description="What users paid, what providers charged, and the profit left over. Every figure follows the date range and currency below."
        navHref={PAGE_PATH}
        title="Profit & costs"
      />

      <RangeToolbar currency={currency} from={from} params={params} rawFrom={raw.from} rawTo={raw.to} to={to} />

      <Suspense fallback={<OverviewFallback />}>
        <OverviewSection
          chatSummariesPromise={chatSummariesPromise}
          costBreakdownPromise={costBreakdownPromise}
          currency={currency}
          partnerPayoutsPromise={partnerPayoutsPromise}
          rangeLabel={describeRange(from, to)}
          rechargeSummariesPromise={rechargeSummariesPromise}
          usdToInrPromise={usdToInrPromise}
        />
      </Suspense>

      <Suspense fallback={<PanelFallback rows={6} title="Daily cost" />}>
        <CostTrendSection
          costBreakdownPromise={costBreakdownPromise}
          currency={currency}
          usdToInrPromise={usdToInrPromise}
        />
      </Suspense>

      <Suspense fallback={<PanelFallback rows={6} title="Chat profit log" />}>
        <ChatProfitSection
          chatSummariesPromise={chatSummariesPromise}
          currency={currency}
          page={page}
          pageSize={pageSize}
          params={params}
          usdToInrPromise={usdToInrPromise}
        />
      </Suspense>

      <Suspense fallback={<PanelFallback rows={4} title="Recharges" />}>
        <RechargeSection
          currency={currency}
          page={rechargePage}
          pageSize={pageSize}
          params={params}
          rechargeRecordsPromise={rechargeRecordsPromise}
          usdToInrPromise={usdToInrPromise}
        />
      </Suspense>

      <Suspense fallback={<PanelFallback rows={4} title="Model pricing" />}>
        <ModelPricingSection
          currency={currency}
          modelConfigsPromise={modelConfigsPromise}
          usdToInrPromise={usdToInrPromise}
        />
      </Suspense>
    </div>
  );
}

