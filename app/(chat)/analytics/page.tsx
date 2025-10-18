"use server";

import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import {
  getDailyTokenUsageForUser,
  getSessionTokenUsageForUser,
  getTokenUsageTotalsForUser,
  getUserBalanceSummary,
} from "@/lib/db/queries";
import { TOKENS_PER_CREDIT } from "@/lib/constants";

function formatDateLabel(date: Date) {
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

export default async function AnalyticsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/analytics");
  }

  const [balance, totals, dailyUsage, sessionUsage] = await Promise.all([
    getUserBalanceSummary(session.user.id),
    getTokenUsageTotalsForUser(session.user.id),
    getDailyTokenUsageForUser(session.user.id, 14),
    getSessionTokenUsageForUser(session.user.id),
  ]);
  const formatCredits = (tokens: number) =>
    (tokens / TOKENS_PER_CREDIT).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const plan = balance.plan;
  const expiresAt = balance.expiresAt ? new Date(balance.expiresAt) : null;
  const daysRemaining = expiresAt
    ? Math.max(
        Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        0
      )
    : null;
  const expiryLabel = expiresAt
    ? `${expiresAt.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })}${
        daysRemaining !== null
          ? ` (${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left)`
          : ""
      }`
    : "No active plan";
  const costPerCredit =
    plan && plan.tokenAllowance > 0
      ? (plan.priceInPaise / 100) /
        Math.max(1, plan.tokenAllowance / TOKENS_PER_CREDIT)
      : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Usage analytics</h1>
        <p className="text-muted-foreground text-sm">
          Track how many credits you have used and how many remain in your plan.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          label="Total credits used"
          value={formatCredits(totals.totalTokens)}
        />
        <MetricCard
          label="Credits remaining"
          value={balance.creditsRemaining.toLocaleString()}
        />
        <MetricCard
          label="Credits allocated"
          value={balance.creditsTotal.toLocaleString()}
        />
        <MetricCard
          label="Cost per credit"
          value={
            costPerCredit !== null
              ? `INR ${costPerCredit.toFixed(2)}`
              : "Unavailable"
          }
        />
        <MetricCard label="Plan expires" value={expiryLabel} />
      </section>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Daily usage</h2>
        <p className="text-muted-foreground text-sm">
          Credits consumed per day (last 14 days).
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {dailyUsage.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No usage recorded yet.
            </p>
          )}
          {dailyUsage.map((entry) => (
            <div
              key={entry.day.toISOString()}
              className="rounded-md border bg-background p-3 text-sm"
            >
              <p className="text-muted-foreground text-xs uppercase">
                {formatDateLabel(entry.day)}
              </p>
              <p className="mt-1 text-lg font-semibold">
                {formatCredits(entry.totalTokens)} credits
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
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
              {sessionUsage.length === 0 ? (
                <tr>
                  <td className="py-4 text-muted-foreground" colSpan={2}>
                    No usage recorded yet.
                  </td>
                </tr>
              ) : (
                sessionUsage.map((entry) => (
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
      </section>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-muted-foreground text-xs uppercase">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
