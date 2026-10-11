import {
  BarChart3,
  CalendarClock,
  Coins,
  CreditCard,
  Gift,
  MessagesSquare,
  Sparkles,
  TrendingDown,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BackToHomeButton } from "@/app/(chat)/profile/back-to-home-button";
import {
  AccountMeter,
  AccountNotice,
  AccountPageShell,
  AccountSection,
  AccountStat,
} from "@/components/account/account-ui";
import { DailyUsageChartSwitcher } from "@/components/daily-usage-chart-switcher";
import { DailyUsageRangeSelect } from "@/components/daily-usage-range-select";
import { RechargeHistoryDialog } from "@/components/recharge-history-dialog";
import { SessionUsageChatLink } from "@/components/session-usage-chat-link";
import {
  SessionUsagePagination,
  SessionUsageSortSelect,
} from "@/components/session-usage-pagination";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { buttonVariants } from "@/components/ui/button";
import type { SessionSortOption } from "@/lib/subscriptions/session-sort";
import { cn } from "@/lib/utils";

type RechargeHistoryProps = React.ComponentProps<typeof RechargeHistoryDialog>;

export type SubscriptionsOverview = {
  planName: string;
  planPriceLabel: string | null;
  hasPaidPlan: boolean;
  freeCreditsLabel: string | null;
  creditsRemainingLabel: string;
  creditsTotalLabel: string;
  /** Share of credits left, or null when there is no allowance. */
  remainingPercent: number | null;
  expiryDateLabel: string;
  daysRemaining: number | null;
};

export type SubscriptionsStats = {
  usedLabel: string;
  allocatedLabel: string;
  paidRemainingLabel: string;
  adminRemainingLabel: string;
};

export type DailyUsageView = {
  ok: boolean;
  range: number;
  rangeOptions: readonly number[];
  hasUsage: boolean;
  chartData: Array<{ date: string; credits: number }>;
  totalLabel: string;
  peak: { dateLabel: string; creditsLabel: string } | null;
  rows: Array<{ key: string; dateLabel: string; creditsLabel: string }>;
};

export type SessionUsageView = {
  ok: boolean;
  range: number;
  sessionSort: SessionSortOption;
  sessionsPage: number;
  totalPages: number;
  total: number;
  rows: Array<{
    chatId: string;
    title: string;
    startedLabel: string;
    lastUsedLabel: string;
    creditsLabel: string;
  }>;
};

function SubscriptionsBackButton() {
  return <BackToHomeButton label="Back" translationKey="navigation.back" variant="pill" />;
}

function SubscriptionsTitle() {
  return (
    <EditableTranslation
      defaultText="Subscriptions & Credits"
      translationKey="subscriptions.title"
    />
  );
}

export function SubscriptionsView({
  dailyUsage,
  degraded,
  overview,
  rechargeHistory,
  sessions,
  stats,
}: {
  dailyUsage: DailyUsageView;
  degraded: boolean;
  overview: SubscriptionsOverview;
  rechargeHistory: RechargeHistoryProps;
  sessions: SessionUsageView;
  stats: SubscriptionsStats;
}) {
  return (
    <AccountPageShell
      back={<SubscriptionsBackButton />}
      description={
        <EditableTranslation
          defaultText="Track your current plan, credit balance, and recent usage."
          translationKey="subscriptions.subtitle"
        />
      }
      title={<SubscriptionsTitle />}
    >
      {degraded ? (
        <AccountNotice
          title={
            <EditableTranslation
              defaultText="Some subscription details could not be confirmed."
              translationKey="subscriptions.warning.partial_title"
            />
          }
        >
          <EditableTranslation
            defaultText="Your balance is shown, but one or more usage or recharge sections is temporarily unavailable."
            translationKey="subscriptions.warning.partial_body"
          />
        </AccountNotice>
      ) : null}

      <PlanOverview overview={overview} rechargeHistory={rechargeHistory} />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <AccountStat
          icon={TrendingDown}
          label={
            <EditableTranslation
              defaultText="Total credits used"
              translationKey="subscriptions.metric.total_used"
            />
          }
          value={stats.usedLabel}
        />
        <AccountStat
          icon={Coins}
          label={
            <EditableTranslation
              defaultText="Credits allocated"
              translationKey="subscriptions.metric.allocated"
            />
          }
          value={stats.allocatedLabel}
        />
        <AccountStat
          icon={Wallet}
          label={
            <EditableTranslation
              defaultText="Paid credits remaining"
              translationKey="subscriptions.plan_overview.credits_recharged"
            />
          }
          value={stats.paidRemainingLabel}
        />
        <AccountStat
          icon={Gift}
          label={
            <EditableTranslation
              defaultText="Admin credits remaining"
              translationKey="subscriptions.plan_overview.credits_allocated"
            />
          }
          value={stats.adminRemainingLabel}
        />
      </section>

      <DailyUsageSection dailyUsage={dailyUsage} />
      <SessionUsageSection sessions={sessions} />
    </AccountPageShell>
  );
}

function PlanOverview({
  overview,
  rechargeHistory,
}: {
  overview: SubscriptionsOverview;
  rechargeHistory: RechargeHistoryProps;
}) {
  const percent = overview.remainingPercent;
  const lowCredits = percent !== null && percent <= 20;
  const meterTone =
    percent === null ? "default" : percent <= 5 ? "danger" : lowCredits ? "warning" : "success";
  const days = overview.daysRemaining;

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-2 md:gap-8">
        <div className="flex min-w-0 flex-col">
          <p className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
            <CreditCard aria-hidden="true" className="size-4" />
            <EditableTranslation
              defaultText="Current plan"
              translationKey="subscriptions.plan_overview.current_plan"
            />
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-2xl tracking-tight">{overview.planName}</h2>
            {overview.planPriceLabel ? (
              <span className="rounded-full border bg-muted/60 px-2.5 py-0.5 font-medium text-xs tabular-nums">
                {overview.planPriceLabel}
              </span>
            ) : null}
          </div>
          {overview.freeCreditsLabel ? (
            <p className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 font-medium text-emerald-700 text-xs dark:text-emerald-400">
              <Sparkles aria-hidden="true" className="size-3.5" />
              <EditableTranslation
                defaultText="Free credits"
                translationKey="subscriptions.plan_overview.free_credits"
              />
              <span className="tabular-nums">{overview.freeCreditsLabel}</span>
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <CalendarClock aria-hidden="true" className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">
              <EditableTranslation
                defaultText="Plan expires"
                translationKey="subscriptions.plan_overview.plan_expires"
              />
            </span>
            <span className="font-medium">{overview.expiryDateLabel}</span>
            {days !== null ? (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-medium text-xs",
                  days <= 7
                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    : "bg-muted text-muted-foreground"
                )}
              >
                <EditableTranslation
                  defaultText="{count} day{plural} left"
                  description="Days until the current plan's credits expire, shown beside the expiry date."
                  translationKey="subscriptions.plan_overview.days_left"
                  values={{ count: days, plural: days === 1 ? "" : "s" }}
                />
              </span>
            ) : null}
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              className={cn(buttonVariants({ size: "lg" }), "h-10 w-full cursor-pointer px-5 sm:w-auto")}
              href="/recharge"
            >
              <Wallet aria-hidden="true" />
              <EditableTranslation
                defaultText="Recharge"
                translationKey="subscriptions.quick_actions.recharge_button"
              />
            </Link>
            <RechargeHistoryDialog {...rechargeHistory} triggerClassName="w-full sm:w-auto" />
          </div>
          <p className="mt-3 text-muted-foreground text-xs">
            <EditableTranslation
              defaultText="Receipts are emailed after purchase and can be downloaded from Recharge history."
              translationKey="subscriptions.quick_actions.receipt_help"
            />
          </p>
        </div>

        <div className="flex flex-col justify-center rounded-xl bg-muted/40 p-4 sm:p-5">
          <p className="font-medium text-muted-foreground text-sm">
            <EditableTranslation
              defaultText="Credits remaining"
              translationKey="subscriptions.plan_overview.credits_remaining"
            />
          </p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold text-3xl tabular-nums tracking-tight sm:text-4xl">
              {overview.creditsRemainingLabel}
            </span>
            <span className="text-muted-foreground text-sm tabular-nums">
              / {overview.creditsTotalLabel}
            </span>
          </p>
          {percent !== null ? (
            <>
              <AccountMeter
                className="mt-4"
                label={`${Math.round(percent)}%`}
                tone={meterTone}
                value={percent}
              />
              <p className="mt-2 text-muted-foreground text-xs">
                <EditableTranslation
                  defaultText="{percent}% of your credits left"
                  description="Share of the current credit allowance that is still available."
                  translationKey="subscriptions.overview.percent_left"
                  values={{ percent: Math.round(percent) }}
                />
              </p>
            </>
          ) : null}
          {lowCredits ? (
            <p className="mt-3 text-amber-700 text-sm dark:text-amber-400">
              <EditableTranslation
                defaultText="You're running low on credits. Recharge to keep chatting without interruption."
                description="Shown on the subscriptions page when 20% or less of the credit allowance is left."
                translationKey="subscriptions.overview.low_credits"
              />
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function StatePanel({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "warning";
}) {
  return (
    <div
      className={cn(
        "flex min-h-40 items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center text-sm",
        tone === "warning"
          ? "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400"
          : "bg-muted/30 text-muted-foreground"
      )}
    >
      {children}
    </div>
  );
}

function DailyUsageSection({ dailyUsage }: { dailyUsage: DailyUsageView }) {
  return (
    <AccountSection
      action={
        <DailyUsageRangeSelect
          currentRange={dailyUsage.range}
          options={dailyUsage.rangeOptions}
        />
      }
      description={
        <EditableTranslation
          defaultText="Credits consumed per day."
          translationKey="subscriptions.daily_usage.subtitle"
        />
      }
      icon={BarChart3}
      title={
        <EditableTranslation
          defaultText="Daily usage"
          translationKey="subscriptions.daily_usage.title"
        />
      }
    >
      {!dailyUsage.ok ? (
        <StatePanel tone="warning">
          <EditableTranslation
            defaultText="Daily usage could not be loaded right now."
            translationKey="subscriptions.daily_usage.unavailable"
          />
        </StatePanel>
      ) : dailyUsage.hasUsage ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <p className="text-sm">
              <EditableTranslation
                defaultText="{credits} credits in this range"
                description="Total credits used across the selected daily usage range."
                translationKey="subscriptions.daily_usage.total_in_range"
                values={{ credits: dailyUsage.totalLabel }}
              />
            </p>
            {dailyUsage.peak ? (
              <p className="text-muted-foreground text-xs">
                <EditableTranslation
                  defaultText="Peak day: {date} • {credits} credits"
                  translationKey="subscriptions.daily_usage.peak_day"
                  values={{
                    credits: dailyUsage.peak.creditsLabel,
                    date: dailyUsage.peak.dateLabel,
                  }}
                />
              </p>
            ) : null}
          </div>
          <DailyUsageChartSwitcher data={dailyUsage.chartData} />
          <details className="group rounded-xl border">
            <summary className="flex min-h-10 cursor-pointer list-none items-center px-4 text-muted-foreground text-sm transition hover:text-foreground [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">
                <EditableTranslation
                  defaultText="Show as table"
                  description="Reveals the daily usage chart values as a table."
                  translationKey="subscriptions.daily_usage.table_show"
                />
              </span>
              <span className="hidden group-open:inline">
                <EditableTranslation
                  defaultText="Hide table"
                  description="Hides the daily usage table."
                  translationKey="subscriptions.daily_usage.table_hide"
                />
              </span>
            </summary>
            <div className="max-h-72 overflow-y-auto border-t">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-muted-foreground text-xs">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium" scope="col">
                      <EditableTranslation
                        defaultText="Date"
                        translationKey="subscriptions.recharge_history.column.date"
                      />
                    </th>
                    <th className="px-4 py-2 text-right font-medium" scope="col">
                      <EditableTranslation
                        defaultText="Credits used"
                        translationKey="subscriptions.session_usage.headers.credits_used"
                      />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 tabular-nums">
                  {dailyUsage.rows.map((row) => (
                    <tr key={row.key}>
                      <td className="px-4 py-2">{row.dateLabel}</td>
                      <td className="px-4 py-2 text-right">{row.creditsLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      ) : (
        <StatePanel>
          <EditableTranslation
            defaultText="No usage recorded in this range."
            translationKey="subscriptions.daily_usage.empty"
          />
        </StatePanel>
      )}
    </AccountSection>
  );
}

function SessionUsageSection({ sessions }: { sessions: SessionUsageView }) {
  return (
    <AccountSection
      action={
        <SessionUsageSortSelect range={sessions.range} sessionSort={sessions.sessionSort} />
      }
      bodyClassName="p-0"
      description={
        <EditableTranslation
          defaultText="Total credits used across your recent chats."
          translationKey="subscriptions.session_usage.subtitle"
        />
      }
      icon={MessagesSquare}
      title={
        <EditableTranslation
          defaultText="Usage by session"
          translationKey="subscriptions.session_usage.title"
        />
      }
    >
      {!sessions.ok ? (
        <div className="p-5 sm:p-6">
          <StatePanel tone="warning">
            <EditableTranslation
              defaultText="Session usage could not be loaded right now."
              translationKey="subscriptions.session_usage.unavailable"
            />
          </StatePanel>
        </div>
      ) : sessions.rows.length === 0 ? (
        <div className="p-5 sm:p-6">
          <StatePanel>
            <EditableTranslation
              defaultText="No usage recorded yet."
              translationKey="subscriptions.session_usage.empty"
            />
          </StatePanel>
        </div>
      ) : (
        <>
          <div className="hidden grid-cols-[minmax(0,1fr)_11rem_11rem_8rem] gap-4 border-b bg-muted/40 px-6 py-2.5 font-medium text-muted-foreground text-xs md:grid">
            <span>
              <EditableTranslation
                defaultText="Chat"
                translationKey="subscriptions.session_usage.headers.chat"
              />
            </span>
            <span>
              <EditableTranslation
                defaultText="Started on"
                translationKey="subscriptions.session_usage.headers.created"
              />
            </span>
            <span>
              <EditableTranslation
                defaultText="Last activity"
                translationKey="subscriptions.session_usage.headers.last_used"
              />
            </span>
            <span className="text-right">
              <EditableTranslation
                defaultText="Credits used"
                translationKey="subscriptions.session_usage.headers.credits_used"
              />
            </span>
          </div>
          <ul className="divide-y divide-border/60">
            {sessions.rows.map((row) => (
              <li
                className="flex items-start justify-between gap-4 px-5 py-3.5 transition hover:bg-muted/30 sm:px-6 md:grid md:grid-cols-[minmax(0,1fr)_11rem_11rem_8rem] md:items-center"
                key={row.chatId}
              >
                <div className="min-w-0">
                  <SessionUsageChatLink
                    className="block min-w-0 cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    href={`/chat/${row.chatId}`}
                  >
                    <span className="block truncate font-medium hover:underline">
                      {row.title}
                    </span>
                    <span className="block font-mono text-muted-foreground text-xs">
                      {row.chatId.slice(0, 8)}
                    </span>
                  </SessionUsageChatLink>
                  <p className="mt-1 text-muted-foreground text-xs md:hidden">
                    <EditableTranslation
                      defaultText="Last activity"
                      translationKey="subscriptions.session_usage.headers.last_used"
                    />
                    : {row.lastUsedLabel}
                  </p>
                </div>
                <span className="hidden text-muted-foreground text-sm md:block">
                  {row.startedLabel}
                </span>
                <span className="hidden text-muted-foreground text-sm md:block">
                  {row.lastUsedLabel}
                </span>
                <span className="shrink-0 text-right font-semibold tabular-nums">
                  {row.creditsLabel}
                  <span className="block font-normal text-muted-foreground text-xs md:hidden">
                    <EditableTranslation
                      defaultText="credits"
                      translationKey="subscriptions.unit.credits"
                    />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {sessions.ok && sessions.total > 0 ? (
        <SessionUsagePagination
          range={sessions.range}
          sessionSort={sessions.sessionSort}
          sessionsPage={sessions.sessionsPage}
          totalPages={sessions.totalPages}
        />
      ) : null}
    </AccountSection>
  );
}

export function SubscriptionsUnavailableView({ message }: { message: string }) {
  return (
    <AccountPageShell back={<SubscriptionsBackButton />} title={<SubscriptionsTitle />}>
      <AccountNotice
        title={
          <EditableTranslation
            defaultText="Subscription details are unavailable"
            description="Heading shown when the subscriptions page cannot load the credit balance."
            translationKey="subscriptions.error.unavailable_title"
          />
        }
      >
        <p>{message}</p>
        <Link
          className={cn(buttonVariants({ variant: "outline" }), "mt-3 h-10 cursor-pointer")}
          href="/subscriptions"
        >
          <EditableTranslation
            defaultText="Retry"
            description="Reloads the subscriptions page after the balance failed to load."
            translationKey="subscriptions.error.retry"
          />
        </Link>
      </AccountNotice>
    </AccountPageShell>
  );
}
