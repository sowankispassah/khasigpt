import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TOKENS_PER_CREDIT } from "@/lib/constants";
import {
  getDailyTokenUsageForUser,
  getSessionTokenUsageForUser,
  getUserBalanceSummary,
  listUserRechargeHistory,
} from "@/lib/db/queries";
import { getTranslationBundle } from "@/lib/i18n/dictionary";
import {
  isSessionSortOption,
  SESSION_SORT_DEFAULT,
  type SessionSortOption,
} from "@/lib/subscriptions/session-sort";
import { withTimeout } from "@/lib/utils/async";
import { getChatRouteSession } from "../chat-route-session";
import { SubscriptionsUnavailableView, SubscriptionsView } from "./subscriptions-view";

export const dynamic = "force-dynamic";

const MANUAL_TOP_UP_PLAN_ID = "00000000-0000-0000-0000-0000000000ff";
const RANGE_OPTIONS = [7, 14, 30, 60, 90] as const;
const SESSIONS_PAGE_SIZE = 10;
const DICTIONARY_TIMEOUT_MS = 4000;
const BALANCE_TIMEOUT_MS = 7000;
const OPTIONAL_SECTION_TIMEOUT_MS = 6000;

type RangeOption = (typeof RANGE_OPTIONS)[number];
type OptionalSectionResult<T> =
  | {
      data: T;
      error: null;
      ok: true;
    }
  | {
      data: T;
      error: string;
      ok: false;
    };

type SubscriptionsPageProps = {
  searchParams?: Promise<{
    sessionSort?: string | string[];
    range?: string | string[];
    sessionsPage?: string | string[];
  }>;
};

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const IST_TIME_ZONE = "Asia/Kolkata";
const istMonthDayFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  month: "short",
  day: "numeric",
});
const istDateFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const istDateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const IST_OFFSET_MS = 330 * 60 * 1000;

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "The section could not be loaded.";
}

async function loadOptionalSubscriptionSection<T>({
  fallback,
  label,
  promise,
}: {
  fallback: T;
  label: string;
  promise: Promise<T>;
}): Promise<OptionalSectionResult<T>> {
  try {
    return {
      data: await withTimeout(promise, OPTIONAL_SECTION_TIMEOUT_MS, () => {
        console.error(`[subscriptions] ${label} read timed out.`, {
          timeoutMs: OPTIONAL_SECTION_TIMEOUT_MS,
        });
      }),
      error: null,
      ok: true,
    };
  } catch (error) {
    console.error(`[subscriptions] ${label} read failed.`, error);
    return {
      data: fallback,
      error: getErrorMessage(error),
      ok: false,
    };
  }
}

export default async function SubscriptionsPage({
  searchParams,
}: SubscriptionsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const session = await getChatRouteSession();

  if (!session?.user) {
    redirect("/login");
  }

  const rangeParam = toSingleValue(resolvedSearchParams?.range);
  const requestedRange = Number.parseInt(rangeParam ?? "", 10);
  const range: RangeOption = RANGE_OPTIONS.includes(
    requestedRange as RangeOption
  )
    ? (requestedRange as RangeOption)
    : 14;

  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;

  const sessionSortParam = toSingleValue(resolvedSearchParams?.sessionSort);
  const sessionSort: SessionSortOption = isSessionSortOption(sessionSortParam)
    ? sessionSortParam
    : SESSION_SORT_DEFAULT;

  const { dictionary } = await withTimeout(
    getTranslationBundle(preferredLanguage),
    DICTIONARY_TIMEOUT_MS,
    () => {
      console.error("[subscriptions] Translation bundle read timed out.", {
        timeoutMs: DICTIONARY_TIMEOUT_MS,
      });
    }
  ).catch((error) => {
    console.error("[subscriptions] Translation bundle read failed.", error);
    return { dictionary: {} as Record<string, string> };
  });

  const t = (key: string, fallback: string) => dictionary[key] ?? fallback;

  const [
    balance,
    dailyUsageResult,
    sessionUsageResult,
    rechargeHistoryResult,
  ] = await Promise.all([
    withTimeout(getUserBalanceSummary(session.user.id), BALANCE_TIMEOUT_MS, () => {
      console.error("[subscriptions] Balance read timed out.", {
        timeoutMs: BALANCE_TIMEOUT_MS,
      });
    }).catch((error) => {
      console.error("[subscriptions] Balance read failed.", error);
      return null;
    }),
    loadOptionalSubscriptionSection({
      fallback: [] as Awaited<ReturnType<typeof getDailyTokenUsageForUser>>,
      label: "daily usage",
      promise: getDailyTokenUsageForUser(session.user.id, range),
    }),
    loadOptionalSubscriptionSection({
      fallback: [] as Awaited<ReturnType<typeof getSessionTokenUsageForUser>>,
      label: "session usage",
      promise: getSessionTokenUsageForUser(session.user.id, {
        sortBy: sessionSort,
      }),
    }),
    loadOptionalSubscriptionSection({
      fallback: [] as Awaited<ReturnType<typeof listUserRechargeHistory>>,
      label: "recharge history",
      promise: listUserRechargeHistory({ userId: session.user.id, limit: 10 }),
    }),
  ]);

  if (!balance) {
    return (
      <SubscriptionsUnavailableView
        message={t(
          "subscriptions.error.balance_unavailable",
          "Your subscription balance could not be loaded right now. Please retry shortly."
        )}
      />
    );
  }

  const rawDailyUsage = dailyUsageResult.data;
  const sessionUsage = sessionUsageResult.data;
  const rechargeHistory = rechargeHistoryResult.data;
  const hasDegradedOptionalSections =
    !dailyUsageResult.ok || !sessionUsageResult.ok || !rechargeHistoryResult.ok;

  const sessionsPageParam = toSingleValue(resolvedSearchParams?.sessionsPage);
  let sessionsPage = Number.parseInt(sessionsPageParam ?? "", 10);
  if (!Number.isFinite(sessionsPage) || sessionsPage < 1) {
    sessionsPage = 1;
  }

  const totalSessionPages = Math.max(
    1,
    Math.ceil(sessionUsage.length / SESSIONS_PAGE_SIZE)
  );
  if (sessionsPage > totalSessionPages) {
    sessionsPage = totalSessionPages;
  }

  const displayedSessions = sessionUsage.slice(
    0,
    sessionsPage * SESSIONS_PAGE_SIZE
  );

  const formatDateTime = (date: Date | null, key: string, fallback: string) =>
    date ? istDateTimeFormatter.format(date) : t(key, fallback);

  const formatCredits = (tokens: number) =>
    (tokens / TOKENS_PER_CREDIT).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const formatCreditValue = (credits: number) =>
    credits.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const formatRechargeAmount = (amount: number, currency: string) =>
    new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(amount);
  const formatRechargeStatus = (status: string) => {
    const normalized = status?.toLowerCase() ?? "";
    if (normalized === "paid") {
      return t("subscriptions.recharge_history.status.paid", "Paid");
    }
    if (normalized === "processing") {
      return t(
        "subscriptions.recharge_history.status.processing",
        "Processing"
      );
    }
    return t("subscriptions.recharge_history.status.failed", "Failed");
  };

  const now = new Date();
  const isExpiredBalance =
    balance.expiresAt instanceof Date &&
    balance.expiresAt.getTime() <= now.getTime();
  const effectiveTokensRemaining = isExpiredBalance ? 0 : balance.tokensRemaining;
  const effectiveTokensTotal = isExpiredBalance ? 0 : balance.tokensTotal;
  const effectiveCreditsRemaining = isExpiredBalance
    ? 0
    : balance.creditsRemaining;
  const effectiveCreditsTotal = isExpiredBalance ? 0 : balance.creditsTotal;
  const effectiveAllocatedCredits = isExpiredBalance
    ? 0
    : balance.allocatedCredits;
  const effectiveRechargedCredits = isExpiredBalance
    ? 0
    : balance.rechargedCredits;

  const billedTokensUsed = Math.max(
    0,
    effectiveTokensTotal - effectiveTokensRemaining
  );

  const plan = isExpiredBalance ? null : balance.plan;
  const isManualPlan = plan?.id === MANUAL_TOP_UP_PLAN_ID;
  const hasPaidPlan = Boolean(plan && !isManualPlan);
  const allocatedCredits = effectiveAllocatedCredits;
  const rechargedCredits = effectiveRechargedCredits;
  const rechargeHistoryRows = rechargeHistory.map((entry) => {
    const planLabel =
      entry.planName ??
      t("subscriptions.recharge_history.unknown_plan", "Plan unavailable");
    const amountLabel = formatRechargeAmount(entry.amount, entry.currency);
    const statusLabel = formatRechargeStatus(entry.status);
    const normalizedStatus = entry.status?.toLowerCase() ?? "";
    const statusIcon =
      normalizedStatus === "paid"
        ? "✔"
        : normalizedStatus === "processing"
          ? "⏳"
          : "✖";
    const statusColor =
      normalizedStatus === "paid"
        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
        : normalizedStatus === "processing"
          ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : "bg-destructive/10 text-destructive";
    const createdAt =
      entry.createdAt instanceof Date
        ? entry.createdAt
        : new Date(entry.createdAt);
    const dateLabel = istDateTimeFormatter.format(createdAt);

    return {
      orderId: entry.orderId,
      planLabel,
      amountLabel,
      statusLabel,
      statusIcon,
      statusColor,
      canRetry: normalizedStatus !== "paid",
      dateLabel,
    };
  });
  const rechargeHistoryLabels = {
    title: t("subscriptions.recharge_history.title", "Recharge history"),
    subtitle: t(
      "subscriptions.recharge_history.subtitle",
      "Recent top-ups you've completed."
    ),
    empty: t(
      "subscriptions.recharge_history.empty",
      rechargeHistoryResult.ok
        ? "You haven't recharged your account yet."
        : "Recharge history could not be loaded right now. Please retry shortly."
    ),
    plan: t("subscriptions.recharge_history.column.plan", "Plan"),
    amount: t("subscriptions.recharge_history.column.amount", "Amount"),
    status: t("subscriptions.recharge_history.column.status", "Status"),
    date: t("subscriptions.recharge_history.column.date", "Date"),
    trigger: t(
      "subscriptions.recharge_history.trigger_label",
      "View recharge history"
    ),
    close: t("subscriptions.recharge_history.close_button", "Close"),
    retry: t("subscriptions.recharge_history.try_again", "Try again"),
  };
  const planPriceLabel = plan?.priceInPaise
    ? currencyFormatter.format(plan.priceInPaise / 100)
    : null;
  const planName = hasPaidPlan
    ? (plan?.name ??
      t("subscriptions.plan_overview.active_plan", "Active plan"))
    : t("subscriptions.plan_overview.no_plan", "Free Plan");

  const freeCreditsRemaining = isManualPlan
    ? effectiveCreditsRemaining
    : !plan && effectiveCreditsRemaining > 0
      ? effectiveCreditsRemaining
      : 0;
  const showFreeCredits = freeCreditsRemaining > 0;

  const expiresAt =
    !isExpiredBalance && balance.expiresAt
      ? new Date(balance.expiresAt)
      : null;
  const daysRemaining =
    expiresAt !== null
      ? Math.max(
          Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
          0
        )
      : null;
  const expiryDateLabel =
    expiresAt !== null
      ? istDateFormatter.format(expiresAt)
      : t("subscriptions.plan_overview.no_active_plan", "No active plan");

  const dailySeries = buildDailySeries(rawDailyUsage, range);
  const dailyChartData = dailySeries.map((entry) => ({
    date: entry.day.toISOString(),
    credits: entry.billableCreditUnits / TOKENS_PER_CREDIT,
  }));
  const maxBillableCreditUnits = dailySeries.reduce(
    (max, entry) => Math.max(max, entry.billableCreditUnits),
    0
  );
  const rangeBillableCreditUnits = dailySeries.reduce(
    (total, entry) => total + entry.billableCreditUnits,
    0
  );
  const peakEntry =
    dailySeries.length > 0
      ? dailySeries.reduce((prev, current) =>
          current.billableCreditUnits > prev.billableCreditUnits
            ? current
            : prev
        )
      : null;

  return (
    <SubscriptionsView
      dailyUsage={{
        chartData: dailyChartData,
        hasUsage: maxBillableCreditUnits > 0,
        ok: dailyUsageResult.ok,
        peak: peakEntry
          ? {
              creditsLabel: formatCredits(peakEntry.billableCreditUnits),
              dateLabel: istMonthDayFormatter.format(peakEntry.day),
            }
          : null,
        range,
        rangeOptions: RANGE_OPTIONS,
        rows: [...dailySeries].reverse().map((entry) => ({
          creditsLabel: formatCredits(entry.billableCreditUnits),
          dateLabel: istDateFormatter.format(entry.day),
          key: entry.day.toISOString(),
        })),
        totalLabel: formatCredits(rangeBillableCreditUnits),
      }}
      degraded={hasDegradedOptionalSections}
      overview={{
        creditsRemainingLabel: formatCreditValue(effectiveCreditsRemaining),
        creditsTotalLabel: formatCreditValue(effectiveCreditsTotal),
        daysRemaining,
        expiryDateLabel,
        freeCreditsLabel: showFreeCredits
          ? formatCreditValue(freeCreditsRemaining)
          : null,
        hasPaidPlan,
        planName,
        planPriceLabel: hasPaidPlan ? planPriceLabel : null,
        remainingPercent:
          effectiveCreditsTotal > 0
            ? (effectiveCreditsRemaining / effectiveCreditsTotal) * 100
            : null,
      }}
      rechargeHistory={{ labels: rechargeHistoryLabels, rows: rechargeHistoryRows }}
      sessions={{
        ok: sessionUsageResult.ok,
        range,
        rows: displayedSessions.map((entry) => ({
          chatId: entry.chatId,
          creditsLabel: formatCredits(entry.billableCreditUnits),
          lastUsedLabel: formatDateTime(
            entry.lastUsedAt,
            "subscriptions.session_usage.last_used.unknown",
            "Not available"
          ),
          startedLabel: formatDateTime(
            entry.chatCreatedAt,
            "subscriptions.session_usage.created.unknown",
            "Not available"
          ),
          title:
            entry.chatTitle ??
            t("subscriptions.session_usage.untitled_chat", "Untitled chat"),
        })),
        sessionSort,
        sessionsPage,
        total: sessionUsage.length,
        totalPages: totalSessionPages,
      }}
      stats={{
        adminRemainingLabel: formatCreditValue(allocatedCredits),
        allocatedLabel: formatCreditValue(effectiveCreditsTotal),
        paidRemainingLabel: formatCreditValue(rechargedCredits),
        usedLabel: formatCredits(billedTokensUsed),
      }}
    />
  );
}

function toSingleValue(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function buildDailySeries(
  raw: Array<{
    day: Date;
    totalTokens: number;
    billableCreditUnits: number;
  }>,
  range: number
) {
  const toIstKey = (date: Date) => {
    const istMillis = date.getTime() + IST_OFFSET_MS;
    const istDate = new Date(istMillis);
    const year = istDate.getUTCFullYear();
    const month = String(istDate.getUTCMonth() + 1).padStart(2, "0");
    const day = String(istDate.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const istMidnightFromKey = (key: string) => {
    const [yearStr = "", monthStr = "", dayStr = ""] = key.split("-");
    const year = Number.parseInt(yearStr, 10);
    const month = Number.parseInt(monthStr, 10);
    const day = Number.parseInt(dayStr, 10);

    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day)
    ) {
      return new Date(key);
    }

    const midnightIstMillis = Date.UTC(year, month - 1, day);
    return new Date(midnightIstMillis - IST_OFFSET_MS);
  };

  const normalizeToIstMidnight = (date: Date) =>
    istMidnightFromKey(toIstKey(date));

  if (raw.length === 0) {
    const today = normalizeToIstMidnight(new Date());
    return Array.from({ length: range }, (_, idx) => {
      const day = new Date(today.getTime() - (range - 1 - idx) * 86_400_000);
      return { day, totalTokens: 0, billableCreditUnits: 0 };
    });
  }

  const usageMap = new Map(
    raw.map((entry) => [toIstKey(entry.day), entry])
  );

  const latestDataDay = raw.reduce((latest, entry) => {
    return entry.day.getTime() > latest.getTime() ? entry.day : latest;
  }, raw[0].day);
  const end = normalizeToIstMidnight(
    new Date(Math.max(Date.now(), latestDataDay.getTime()))
  );
  const start = new Date(end.getTime() - (range - 1) * 86_400_000);

  return Array.from({ length: range }, (_, idx) => {
    const day = new Date(start.getTime() + idx * 86_400_000);
    const key = toIstKey(day);
    const entry = usageMap.get(key);
    return {
      day,
      totalTokens: entry?.totalTokens ?? 0,
      billableCreditUnits: entry?.billableCreditUnits ?? 0,
    };
  });
}

function _buildSessionQuery(range: number, sessionsPage: number) {
  const params = new URLSearchParams();
  params.set("range", String(range));
  if (sessionsPage > 1) {
    params.set("sessionsPage", String(sessionsPage));
  }
  return params.toString();
}
