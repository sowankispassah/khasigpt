import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/app/(auth)/auth";
import { BackToHomeButton } from "@/app/(chat)/profile/back-to-home-button";
import { DailyUsageChartSwitcher } from "@/components/daily-usage-chart-switcher";
import { DailyUsageRangeSelect } from "@/components/daily-usage-range-select";
import { RechargeHistoryDialog } from "@/components/recharge-history-dialog";
import { SessionUsageChatLink } from "@/components/session-usage-chat-link";
import { SessionUsagePagination } from "@/components/session-usage-pagination";
import { EditableTranslation } from "@/components/translation-edit-provider";
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
  const session = await auth();

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
      <SubscriptionsUnavailablePage
        message={t(
          "subscriptions.error.balance_unavailable",
          "Your subscription balance could not be loaded right now. Please retry shortly."
        )}
        title={t("subscriptions.title", "Subscriptions & Credits")}
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
        ? "bg-emerald-100 text-emerald-900"
        : normalizedStatus === "processing"
          ? "bg-amber-100 text-amber-900"
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
  const currentPlanLabel = hasPaidPlan
    ? planPriceLabel
      ? `${plan?.name} (${planPriceLabel})`
      : (plan?.name ??
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
  const expiryDaysLabel =
    expiresAt !== null && daysRemaining !== null
      ? t(
          "subscriptions.plan_overview.days_remaining",
          "({count} day{plural} left)"
        )
          .replace("{count}", String(daysRemaining))
          .replace("{plural}", daysRemaining === 1 ? "" : "s")
      : null;

  const dailySeries = buildDailySeries(rawDailyUsage, range);
  const dailyChartData = dailySeries.map((entry) => ({
    date: entry.day.toISOString(),
    credits: entry.totalTokens / TOKENS_PER_CREDIT,
  }));
  const maxTokens = dailySeries.reduce(
    (max, entry) => Math.max(max, entry.totalTokens),
    0
  );
  const peakEntry =
    dailySeries.length > 0
      ? dailySeries.reduce((prev, current) =>
          current.totalTokens > prev.totalTokens ? current : prev
        )
      : null;
  const rangeStart = dailySeries[0]?.day ?? new Date();
  const rangeEnd = dailySeries.at(-1)?.day ?? new Date();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:gap-8">
      <div className="flex items-center gap-3">
        <BackToHomeButton
          label="Back"
          translationKey="navigation.back"
        />
      </div>

      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl">
          <EditableTranslation
            defaultText="Subscriptions & Credits"
            translationKey="subscriptions.title"
          />
        </h1>
        <p className="text-muted-foreground text-sm">
          <EditableTranslation
            defaultText="Track your current plan, credit balance, and recent usage."
            translationKey="subscriptions.subtitle"
          />
        </p>
      </header>

      {hasDegradedOptionalSections ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 text-sm">
          <p className="font-semibold">
            <EditableTranslation
              defaultText="Some subscription details could not be confirmed."
              translationKey="subscriptions.warning.partial_title"
            />
          </p>
          <p className="mt-1">
            <EditableTranslation
              defaultText="Your balance is shown, but one or more usage or recharge sections is temporarily unavailable."
              translationKey="subscriptions.warning.partial_body"
            />
          </p>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={
            <EditableTranslation
              defaultText="Total credits used"
              translationKey="subscriptions.metric.total_used"
            />
          }
          value={formatCredits(billedTokensUsed)}
        />
        <MetricCard
          label={
            <EditableTranslation
              defaultText="Credits remaining"
              translationKey="subscriptions.metric.remaining"
            />
          }
          value={formatCreditValue(effectiveCreditsRemaining)}
        />
        <MetricCard
          label={
            <EditableTranslation
              defaultText="Credits allocated"
              translationKey="subscriptions.metric.allocated"
            />
          }
          value={formatCreditValue(effectiveCreditsTotal)}
        />
        <MetricCard
          label={
            <EditableTranslation
              defaultText="Plan expires"
              translationKey="subscriptions.metric.plan_expires"
            />
          }
          value={
            <div className="flex flex-col">
              <span className="font-semibold text-2xl">{expiryDateLabel}</span>
              {expiryDaysLabel ? (
                <span className="text-muted-foreground text-xs">
                  <EditableTranslation
                    defaultText="({count} day{plural} left)"
                    translationKey="subscriptions.plan_overview.days_remaining"
                    values={{
                      count: daysRemaining ?? 0,
                      plural: daysRemaining === 1 ? "" : "s",
                    }}
                  />
                </span>
              ) : null}
            </div>
          }
        />
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="font-semibold text-lg">
            <EditableTranslation
              defaultText="Plan overview"
              translationKey="subscriptions.plan_overview.title"
            />
          </h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-2 text-muted-foreground">
                <EditableTranslation
                  defaultText="Current plan"
                  translationKey="subscriptions.plan_overview.current_plan"
                />
                <RechargeHistoryDialog
                  labels={rechargeHistoryLabels}
                  rows={rechargeHistoryRows}
                />
              </dt>
              <dd>{currentPlanLabel}</dd>
            </div>
            {showFreeCredits ? (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">
                  <EditableTranslation
                    defaultText="Free credits"
                    translationKey="subscriptions.plan_overview.free_credits"
                  />
                </dt>
                <dd>
                  {formatCreditValue(freeCreditsRemaining)}{" "}
                  {t("subscriptions.unit.credits", "credits")}
                </dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">
                <EditableTranslation
                  defaultText="Credits remaining"
                  translationKey="subscriptions.plan_overview.credits_remaining"
                />
              </dt>
              <dd>{formatCreditValue(effectiveCreditsRemaining)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">
                <EditableTranslation
                  defaultText="Admin credits remaining"
                  translationKey="subscriptions.plan_overview.credits_allocated"
                />
              </dt>
              <dd>{formatCreditValue(allocatedCredits)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">
                <EditableTranslation
                  defaultText="Paid credits remaining"
                  translationKey="subscriptions.plan_overview.credits_recharged"
                />
              </dt>
              <dd>{formatCreditValue(rechargedCredits)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">
                <EditableTranslation
                  defaultText="Plan expires"
                  translationKey="subscriptions.plan_overview.plan_expires"
                />
              </dt>
              <dd>
                <div className="flex flex-col items-end">
                  <span>{expiryDateLabel}</span>
                  {expiryDaysLabel ? (
                    <span className="text-muted-foreground text-xs">
                      <EditableTranslation
                        defaultText="({count} day{plural} left)"
                        translationKey="subscriptions.plan_overview.days_remaining"
                        values={{
                          count: daysRemaining ?? 0,
                          plural: daysRemaining === 1 ? "" : "s",
                        }}
                      />
                    </span>
                  ) : null}
                </div>
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="font-semibold text-lg">
            <EditableTranslation
              defaultText="Quick actions"
              translationKey="subscriptions.quick_actions.title"
            />
          </h2>
          <p className="mt-2 text-muted-foreground text-sm">
            <EditableTranslation
              defaultText="Need more credits? Visit the"
              translationKey="subscriptions.quick_actions.recharge_prefix"
            />{" "}
            <Link className="underline" href="/recharge">
              <EditableTranslation
                defaultText="recharge page"
                translationKey="subscriptions.quick_actions.recharge_link"
              />
            </Link>
            .
          </p>
          <p className="text-muted-foreground text-sm">
            <EditableTranslation
              defaultText="Prefer emailed invoices or receipts? Contact support and we'll help out."
              translationKey="subscriptions.quick_actions.support"
            />
          </p>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-lg">
              <EditableTranslation
                defaultText="Daily usage"
                translationKey="subscriptions.daily_usage.title"
              />
            </h2>
            <p className="text-muted-foreground text-sm">
              <EditableTranslation
                defaultText="Credits consumed per day."
                translationKey="subscriptions.daily_usage.subtitle"
              />
            </p>
          </div>
          <DailyUsageRangeSelect currentRange={range} options={RANGE_OPTIONS} />
        </div>

        {!dailyUsageResult.ok ? (
          <div className="mt-6 flex h-48 items-center justify-center rounded-md border border-amber-300 border-dashed bg-amber-50 text-amber-900 text-sm">
            <EditableTranslation
              defaultText="Daily usage could not be loaded right now."
              translationKey="subscriptions.daily_usage.unavailable"
            />
          </div>
        ) : maxTokens === 0 ? (
          <div className="mt-6 flex h-48 items-center justify-center rounded-md border border-muted-foreground/30 border-dashed bg-muted/30 text-muted-foreground text-sm">
            <EditableTranslation
              defaultText="No usage recorded in this range."
              translationKey="subscriptions.daily_usage.empty"
            />
          </div>
        ) : (
          <>
            <div className="mt-6">
              <DailyUsageChartSwitcher data={dailyChartData} />
            </div>
            <div className="mt-3 flex justify-between text-muted-foreground text-xs">
              <span>{istMonthDayFormatter.format(rangeStart)}</span>
              <span>{istMonthDayFormatter.format(rangeEnd)}</span>
            </div>
            {peakEntry ? (
              <p className="mt-2 text-muted-foreground text-xs">
                <EditableTranslation
                  defaultText="Peak day: {date} • {credits} credits"
                  translationKey="subscriptions.daily_usage.peak_day"
                  values={{
                    date: istMonthDayFormatter.format(peakEntry.day),
                    credits: formatCredits(peakEntry.totalTokens),
                  }}
                />
              </p>
            ) : null}
          </>
        )}
      </section>

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="font-semibold text-lg">
          <EditableTranslation
            defaultText="Usage by session"
            translationKey="subscriptions.session_usage.title"
          />
        </h2>
        <p className="text-muted-foreground text-sm">
          <EditableTranslation
            defaultText="Total credits used across your recent chats."
            translationKey="subscriptions.session_usage.subtitle"
          />
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase">
              <tr>
                <th className="py-2 text-left">
                  <EditableTranslation
                    defaultText="Chat"
                    translationKey="subscriptions.session_usage.headers.chat"
                  />
                </th>
                <th className="py-2 text-left">
                  <EditableTranslation
                    defaultText="Started on"
                    translationKey="subscriptions.session_usage.headers.created"
                  />
                </th>
                <th className="py-2 text-left">
                  <EditableTranslation
                    defaultText="Last activity"
                    translationKey="subscriptions.session_usage.headers.last_used"
                  />
                </th>
                <th className="py-2 text-right">
                  <EditableTranslation
                    defaultText="Credits used"
                    translationKey="subscriptions.session_usage.headers.credits_used"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {!sessionUsageResult.ok ? (
                <tr>
                  <td className="py-4 text-amber-900" colSpan={4}>
                    <EditableTranslation
                      defaultText="Session usage could not be loaded right now."
                      translationKey="subscriptions.session_usage.unavailable"
                    />
                  </td>
                </tr>
              ) : displayedSessions.length === 0 ? (
                <tr>
                  <td className="py-4 text-muted-foreground" colSpan={4}>
                    <EditableTranslation
                      defaultText="No usage recorded yet."
                      translationKey="subscriptions.session_usage.empty"
                    />
                  </td>
                </tr>
              ) : (
                displayedSessions.map((entry) => (
                  <tr className="border-t" key={entry.chatId}>
                    <td className="py-3">
                      <SessionUsageChatLink
                        className="flex cursor-pointer flex-col text-left"
                        href={`/chat/${entry.chatId}`}
                      >
                        <span className="font-medium">
                          {entry.chatTitle ??
                            t(
                              "subscriptions.session_usage.untitled_chat",
                              "Untitled chat"
                            )}
                        </span>
                        <span className="font-mono text-muted-foreground text-xs">
                          {entry.chatId}
                        </span>
                      </SessionUsageChatLink>
                    </td>
                    <td className="py-2 text-muted-foreground text-sm">
                      {formatDateTime(
                        entry.chatCreatedAt,
                        "subscriptions.session_usage.created.unknown",
                        "Not available"
                      )}
                    </td>
                    <td className="py-2 text-muted-foreground text-sm">
                      {formatDateTime(
                        entry.lastUsedAt,
                        "subscriptions.session_usage.last_used.unknown",
                        "Not available"
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {formatCredits(entry.totalTokens)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <SessionUsagePagination
          range={range}
          sessionSort={sessionSort}
          sessionsPage={sessionsPage}
          totalPages={totalSessionPages}
        />
      </section>
    </div>
  );
}

function SubscriptionsUnavailablePage({
  message,
  title,
}: {
  message: string;
  title: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center gap-3">
        <BackToHomeButton label="Back" translationKey="navigation.back" />
      </div>
      <section className="rounded-lg border border-amber-300 bg-amber-50 p-6 text-amber-900 shadow-sm">
        <h1 className="font-semibold text-2xl">{title}</h1>
        <p className="mt-2 text-sm">{message}</p>
        <Link
          className="mt-4 inline-flex cursor-pointer rounded-md border border-amber-300 bg-background px-3 py-2 font-medium text-sm transition hover:bg-amber-100"
          href="/subscriptions"
        >
          Retry
        </Link>
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: ReactNode; value: ReactNode }) {
  const renderValue =
    typeof value === "string" || typeof value === "number" ? (
      <span className="font-semibold text-2xl">{value}</span>
    ) : (
      value
    );

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-muted-foreground text-xs uppercase">{label}</p>
      <div className="mt-2">{renderValue}</div>
    </div>
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
  raw: Array<{ day: Date; totalTokens: number }>,
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
      return { day, totalTokens: 0 };
    });
  }

  const usageMap = new Map(
    raw.map((entry) => [toIstKey(entry.day), entry.totalTokens])
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
    return {
      day,
      totalTokens: usageMap.get(key) ?? 0,
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
