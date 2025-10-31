import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import type { ReactNode } from "react";

import { PageUserMenu } from "@/components/page-user-menu";
import { DailyUsageRangeSelect } from "@/components/daily-usage-range-select";
import { SessionUsagePagination } from "@/components/session-usage-pagination";
import { auth } from "@/app/(auth)/auth";
import {
  getDailyTokenUsageForUser,
  getSessionTokenUsageForUser,
  getTokenUsageTotalsForUser,
  getUserBalanceSummary,
} from "@/lib/db/queries";
import { TOKENS_PER_CREDIT } from "@/lib/constants";

export const dynamic = "force-dynamic";

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

  const [balance, totals, rawDailyUsage, sessionUsage] = await Promise.all([
    getUserBalanceSummary(session.user.id),
    getTokenUsageTotalsForUser(session.user.id),
    getDailyTokenUsageForUser(session.user.id, range),
    getSessionTokenUsageForUser(session.user.id),
  ]);

  const sessionsPageParam = toSingleValue(
    resolvedSearchParams?.sessionsPage
  );
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
  const currentPlanLabel = hasPaidPlan
    ? planPriceLabel
      ? `${plan?.name} (${planPriceLabel})`
      : plan?.name ?? "Active plan"
    : "No plan yet";

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
      : "No active plan";
  const expiryDaysLabel =
    expiresAt !== null && daysRemaining !== null
      ? `(${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left)`
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
  const rangeEnd = dailySeries[dailySeries.length - 1]?.day ?? new Date();

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
      <PageUserMenu />
      <div className="flex items-center gap-3">
        <Link
          className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
          href="/"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to home
        </Link>
        <Link
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-muted-foreground/80"
          href="/profile"
        >
          Manage profile
        </Link>
      </div>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Subscriptions & Credits</h1>
        <p className="text-muted-foreground text-sm">
          Track your current plan, credit balance, and recent usage.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total credits used" value={formatCredits(totals.totalTokens)} />
        <MetricCard
          label="Credits remaining"
          value={balance.creditsRemaining.toLocaleString()}
        />
        <MetricCard
          label="Credits allocated"
          value={balance.creditsTotal.toLocaleString()}
        />
        <MetricCard
          label="Plan expires"
          value={
            <div className="flex flex-col">
              <span className="text-2xl font-semibold">{expiryDateLabel}</span>
              {expiryDaysLabel ? (
                <span className="text-xs text-muted-foreground">
                  {expiryDaysLabel}
                </span>
              ) : null}
            </div>
          }
        />
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Plan overview</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Current plan</dt>
              <dd>{currentPlanLabel}</dd>
            </div>
            {showFreeCredits ? (
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Free credits</dt>
                <dd>{freeCreditsRemaining.toLocaleString()} credits</dd>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Credits remaining</dt>
              <dd>{balance.creditsRemaining.toLocaleString()}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Credits allocated</dt>
              <dd>{balance.creditsTotal.toLocaleString()}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Plan expires</dt>
              <dd>
                <div className="flex flex-col items-end">
                  <span>{expiryDateLabel}</span>
                  {expiryDaysLabel ? (
                    <span className="text-xs text-muted-foreground">
                      {expiryDaysLabel}
                    </span>
                  ) : null}
                </div>
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Quick actions</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Need more credits? Visit the{" "}
            <Link className="underline" href="/recharge">
              recharge page
            </Link>
            .
          </p>
          <p className="text-muted-foreground text-sm">
            Prefer emailed invoices or receipts? Contact support and we&apos;ll help out.
          </p>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Daily usage</h2>
            <p className="text-muted-foreground text-sm">
              Credits consumed per day.
            </p>
          </div>
          <DailyUsageRangeSelect currentRange={range} options={RANGE_OPTIONS} />
        </div>

        {maxTokens === 0 ? (
          <div className="mt-6 flex h-48 items-center justify-center rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 text-sm text-muted-foreground">
            No usage recorded in this range.
          </div>
        ) : (
          <>
            <div className="mt-6 overflow-x-auto">
              <svg
                aria-hidden="true"
                height={chartHeight}
                style={{ minWidth: chartWidth }}
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                width={chartWidth}
              >
                <defs>
                  <linearGradient id="usage-gradient" x1="0" x2="0" y1="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor="hsl(var(--chart-1, var(--primary)))"
                      stopOpacity="0.35"
                    />
                    <stop
                      offset="100%"
                      stopColor="hsl(var(--chart-1, var(--primary)))"
                      stopOpacity="0.05"
                    />
                  </linearGradient>
                </defs>

                {[0.25, 0.5, 0.75, 1].map((fraction) => {
                  const y =
                    chartPaddingY + fraction * (baselineY - chartPaddingY);
                  return (
                    <line
                      key={`grid-${fraction}`}
                      stroke="hsl(var(--border))"
                      strokeDasharray="4 6"
                      strokeOpacity={0.35}
                      strokeWidth={1}
                      x1={chartPaddingX}
                      x2={chartWidth - chartPaddingX}
                      y1={y}
                      y2={y}
                    />
                  );
                })}

                <path
                  d={[
                    `M ${chartPaddingX} ${baselineY}`,
                    `L ${polylinePoints}`,
                    `L ${plottedPoints.at(-1)?.x ?? chartPaddingX} ${baselineY}`,
                    "Z",
                  ].join(" ")}
                  fill="url(#usage-gradient)"
                />

                <polyline
                  fill="none"
                  points={polylinePoints}
                  stroke="hsl(var(--chart-1, var(--primary)))"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                />

                {plottedPoints.map((point) => (
                  <g key={point.entry.day.toISOString()}>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      fill="hsl(var(--chart-1, var(--primary)))"
                      r={4}
                    />
                    <text
                      className="fill-foreground text-[10px] font-semibold"
                      textAnchor="middle"
                      x={point.x}
                      y={Math.min(point.y - 10, chartPaddingY)}
                    >
                      {formatCredits(point.entry.totalTokens)}
                    </text>
                    <text
                      className="fill-muted-foreground text-[10px]"
                      textAnchor="middle"
                      x={point.x}
                      y={baselineY + 16}
                    >
                      {format(point.entry.day, "MMM d")}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            <div className="mt-3 flex justify-between text-xs text-muted-foreground">
              <span>{format(rangeStart, "MMM d")}</span>
              <span>{format(rangeEnd, "MMM d")}</span>
            </div>
            {peakEntry ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Peak day: {format(peakEntry.day, "MMM d")} •{" "}
                {formatCredits(peakEntry.totalTokens)} credits
              </p>
            ) : null}
          </>
        )}
      </section>

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Usage by session</h2>
        <p className="text-muted-foreground text-sm">
          Total credits used across your recent chats.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase">
              <tr>
                <th className="py-2 text-left">Chat ID</th>
                <th className="py-2 text-right">Credits used</th>
              </tr>
            </thead>
            <tbody>
              {displayedSessions.length === 0 ? (
                <tr>
                  <td className="py-4 text-muted-foreground" colSpan={2}>
                    No usage recorded yet.
                  </td>
                </tr>
              ) : (
                displayedSessions.map((entry) => (
                  <tr key={entry.chatId} className="border-t">
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

function MetricCard({ label, value }: { label: string; value: ReactNode }) {
  const renderValue =
    typeof value === "string" || typeof value === "number" ? (
      <span className="text-2xl font-semibold">{value}</span>
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

function toSingleValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function buildDailySeries(
  raw: Array<{ day: Date; totalTokens: number }>,
  range: number
) {
  if (raw.length === 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: range }, (_, idx) => {
      const day = new Date(today.getTime() - (range - 1 - idx) * 86400000);
      return { day, totalTokens: 0 };
    });
  }

  const usageMap = new Map(
    raw.map((entry) => [entry.day.toISOString().slice(0, 10), entry.totalTokens])
  );

  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - (range - 1) * 86400000);

  return Array.from({ length: range }, (_, idx) => {
    const day = new Date(start.getTime() + idx * 86400000);
    const key = day.toISOString().slice(0, 10);
    return {
      day,
      totalTokens: usageMap.get(key) ?? 0,
    };
  });
}

function buildSessionQuery(range: number, sessionsPage: number) {
  const params = new URLSearchParams();
  params.set("range", String(range));
  if (sessionsPage > 1) {
    params.set("sessionsPage", String(sessionsPage));
  }
  return params.toString();
}
