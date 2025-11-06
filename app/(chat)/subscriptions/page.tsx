import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { DailyUsageRangeSelect } from "@/components/daily-usage-range-select";
import { SessionUsagePagination } from "@/components/session-usage-pagination";
import { TOKENS_PER_CREDIT } from "@/lib/constants";
import {
  getDailyTokenUsageForUser,
  getSessionTokenUsageForUser,
  getTokenUsageTotalsForUser,
  getUserBalanceSummary,
} from "@/lib/db/queries";
import { loadRootContext } from "../../root-context";

const MANUAL_TOP_UP_PLAN_ID = "00000000-0000-0000-0000-0000000000ff";
const RANGE_OPTIONS = [7, 14, 30, 60, 90] as const;
const SESSIONS_PAGE_SIZE = 10;

type RangeOption = (typeof RANGE_OPTIONS)[number];

type SubscriptionsPageProps = {
  searchParams?: Promise<{
    range?: string | string[];
    sessionsPage?: string | string[];
  }>;
};

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default async function SubscriptionsPage({
  searchParams,
}: SubscriptionsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const { session, dictionary } = await loadRootContext();

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

  const [balance, totals, rawDailyUsage, sessionUsage] = await Promise.all([
    getUserBalanceSummary(session.user.id),
    getTokenUsageTotalsForUser(session.user.id),
    getDailyTokenUsageForUser(session.user.id, range),
    getSessionTokenUsageForUser(session.user.id),
  ]);

  const t = (key: string, fallback: string) => dictionary[key] ?? fallback;

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

  const formatCredits = (tokens: number) =>
    (tokens / TOKENS_PER_CREDIT).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const plan = balance.plan;
  const isManualPlan = plan?.id === MANUAL_TOP_UP_PLAN_ID;
  const hasPaidPlan = Boolean(plan && !isManualPlan);
  const planPriceLabel = plan?.priceInPaise
    ? currencyFormatter.format(plan.priceInPaise / 100)
    : null;
  const totalSpendInPaise = plan?.priceInPaise ?? null;
  const currentPlanLabel = hasPaidPlan
    ? planPriceLabel
      ? `${plan?.name} (${planPriceLabel})`
      : (plan?.name ??
        t("subscriptions.plan_overview.active_plan", "Active plan"))
    : t("subscriptions.plan_overview.no_plan", "No plan yet");

  const freeCreditsRemaining = isManualPlan
    ? balance.creditsRemaining
    : !plan && balance.creditsRemaining > 0
      ? balance.creditsRemaining
      : 0;
  const showFreeCredits = freeCreditsRemaining > 0;

  const expiresAt = balance.expiresAt ? new Date(balance.expiresAt) : null;
  const daysRemaining =
    expiresAt !== null
      ? Math.max(
          Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
          0
        )
      : null;
  const expiryDateLabel =
    expiresAt !== null
      ? format(expiresAt, "dd MMM yyyy")
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

  const chartWidth = Math.max(dailySeries.length * 56, 560);
  const chartHeight = 200;
  const chartPaddingX = 32;
  const chartPaddingY = 24;
  const yDomain = maxTokens === 0 ? 1 : maxTokens;
  const baselineY = chartHeight - chartPaddingY;
  const xSpacing =
    dailySeries.length > 1
      ? (chartWidth - chartPaddingX * 2) / (dailySeries.length - 1)
      : 0;

  const plottedPoints = dailySeries.map((entry, index) => {
    const scaled = entry.totalTokens / yDomain;
    const y =
      baselineY -
      scaled * Math.max(chartHeight - chartPaddingY * 2, chartPaddingY);
    const x = chartPaddingX + index * xSpacing;
    return { entry, x, y };
  });
  const polylinePoints =
    maxTokens === 0
      ? ""
      : plottedPoints.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:gap-8">
      <div className="flex items-center gap-3">
        <Link
          className="inline-flex items-center gap-2 font-medium text-primary text-sm transition-colors hover:text-primary/80"
          href="/"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          {t("navigation.back_to_home", "Back to home")}
        </Link>
        <Link
          className="inline-flex items-center gap-2 font-medium text-muted-foreground text-sm transition-colors hover:text-muted-foreground/80"
          href="/profile"
        >
          {t("subscriptions.manage_profile", "Manage profile")}
        </Link>
      </div>

      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl">
          {t("subscriptions.title", "Subscriptions & Credits")}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t(
            "subscriptions.subtitle",
            "Track your current plan, credit balance, and recent usage."
          )}
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t("subscriptions.metric.total_used", "Total credits used")}
          value={formatCredits(totals.totalTokens)}
        />
        <MetricCard
          label={t("subscriptions.metric.remaining", "Credits remaining")}
          value={balance.creditsRemaining.toLocaleString()}
        />
        <MetricCard
          label={t("subscriptions.metric.allocated", "Credits allocated")}
          value={balance.creditsTotal.toLocaleString()}
        />
        <MetricCard
          label={t("subscriptions.metric.plan_expires", "Plan expires")}
          value={
            <div className="flex flex-col">
              <span className="font-semibold text-2xl">{expiryDateLabel}</span>
              {expiryDaysLabel ? (
                <span className="text-muted-foreground text-xs">
                  {expiryDaysLabel}
                </span>
              ) : null}
            </div>
          }
        />
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="font-semibold text-lg">
            {t("subscriptions.plan_overview.title", "Plan overview")}
          </h2>
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <p className="text-muted-foreground">
                {t("subscriptions.plan_overview.current_plan", "Current plan")}
              </p>
              <p className="font-semibold text-lg">{currentPlanLabel}</p>
            </div>
            {showFreeCredits ? (
              <div>
                <p className="text-muted-foreground">
                  {t(
                    "subscriptions.plan_overview.free_credits",
                    "Free credits"
                  )}
                </p>
                <p className="font-semibold text-lg">
                  {freeCreditsRemaining.toLocaleString()}
                </p>
              </div>
            ) : null}
            <div>
              <p className="text-muted-foreground">
                {t("subscriptions.plan_overview.total_spend", "Total spend")}
              </p>
              <p className="font-semibold text-lg">
                {totalSpendInPaise !== null
                  ? currencyFormatter.format(totalSpendInPaise / 100)
                  : t(
                      "subscriptions.plan_overview.total_spend_unavailable",
                      "Not available"
                    )}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-lg">
              {t("subscriptions.usage.title", "Usage overview")}
            </h2>
            <DailyUsageRangeSelect
              className="w-auto"
              currentRange={range}
              options={RANGE_OPTIONS}
            />
          </div>
          <UsageChart
            chartHeight={chartHeight}
            chartWidth={chartWidth}
            peakEntry={peakEntry}
            polylinePoints={polylinePoints}
            rangeEnd={rangeEnd}
            rangeStart={rangeStart}
            t={t}
          />
        </div>
      </section>

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="font-semibold text-lg">
          {t("subscriptions.session_usage.title", "Usage by session")}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t(
            "subscriptions.session_usage.subtitle",
            "Total credits used across your recent chats."
          )}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase">
              <tr>
                <th className="py-2 text-left">
                  {t("subscriptions.session_usage.headers.chat_id", "Chat ID")}
                </th>
                <th className="py-2 text-right">
                  {t(
                    "subscriptions.session_usage.headers.credits_used",
                    "Credits used"
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedSessions.length === 0 ? (
                <tr>
                  <td className="py-4 text-muted-foreground" colSpan={2}>
                    {t(
                      "subscriptions.session_usage.empty",
                      "No usage recorded yet."
                    )}
                  </td>
                </tr>
              ) : (
                displayedSessions.map((entry) => (
                  <tr className="border-t" key={entry.chatId}>
                    <td className="py-2 font-mono text-xs">{entry.chatId}</td>
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
          sessionsPage={sessionsPage}
          totalPages={totalSessionPages}
        />
      </section>
    </div>
  );
}

function toSingleValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function buildDailySeries(
  usage: Awaited<ReturnType<typeof getDailyTokenUsageForUser>>,
  range: RangeOption
) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - range + 1);

  const map = new Map<string, { totalTokens: number; day: Date }>();
  for (const entry of usage) {
    const day = new Date(entry.day);
    const key = day.toISOString().slice(0, 10);

    map.set(key, {
      totalTokens: entry.totalTokens,
      day,
    });
  }

  const series: { day: Date; totalTokens: number }[] = [];
  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const key = cursor.toISOString().slice(0, 10);
    const existing = map.get(key);
    series.push({
      day: new Date(cursor),
      totalTokens: existing?.totalTokens ?? 0,
    });
  }

  return series;
}

function UsageChart({
  peakEntry,
  rangeStart,
  rangeEnd,
  polylinePoints,
  chartHeight,
  chartWidth,
  t,
}: {
  peakEntry: ReturnType<typeof buildDailySeries>[number] | null;
  rangeStart: Date;
  rangeEnd: Date;
  polylinePoints: string;
  chartHeight: number;
  chartWidth: number;
  t: (key: string, fallback: string) => string;
}) {
  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between text-muted-foreground text-sm">
        <span>
          {format(rangeStart, "dd MMM")} – {format(rangeEnd, "dd MMM yyyy")}
        </span>
        {peakEntry ? (
          <span>
            {t("subscriptions.usage.peak_day", "Peak")}:{" "}
            {format(peakEntry.day, "dd MMM")} ·{" "}
            {peakEntry.totalTokens.toLocaleString()}{" "}
            {t("subscriptions.usage.tokens_label", "tokens")}
          </span>
        ) : null}
      </div>
      <div className="relative">
        <svg
          aria-label={t(
            "subscriptions.usage.chart_aria",
            "Line chart showing token usage over time."
          )}
          className="h-[200px] w-full"
          height={chartHeight}
          role="img"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          width={chartWidth}
        >
          <polyline
            fill="none"
            points={polylinePoints}
            stroke="url(#usageGradient)"
            strokeLinecap="round"
            strokeWidth={2}
          />
          <defs>
            <linearGradient id="usageGradient" x1="0" x2="0" y1="0" y2="1">
              <stop
                offset="0%"
                stopColor="hsl(var(--primary))"
                stopOpacity="0.9"
              />
              <stop
                offset="100%"
                stopColor="hsl(var(--primary))"
                stopOpacity="0.1"
              />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-muted-foreground text-xs uppercase">{label}</p>
      <div className="mt-2 font-semibold text-2xl">{value}</div>
    </div>
  );
}
