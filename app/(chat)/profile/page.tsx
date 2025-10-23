import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import {
  getDailyTokenUsageForUser,
  getTokenUsageTotalsForUser,
  getUserBalanceSummary,
} from "@/lib/db/queries";
import { PasswordForm } from "./password-form";
import { format } from "date-fns";
import { TOKENS_PER_CREDIT } from "@/lib/constants";

export const dynamic = "force-dynamic";

const MANUAL_TOP_UP_PLAN_ID = "00000000-0000-0000-0000-0000000000ff";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const [balance, totals, daily] = await Promise.all([
    getUserBalanceSummary(session.user.id),
    getTokenUsageTotalsForUser(session.user.id),
    getDailyTokenUsageForUser(session.user.id, 14),
  ]);
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

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:gap-8">
      <div>
        <Link
          className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
          href="/"
        >
          ← Back to home
        </Link>
      </div>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="text-muted-foreground text-sm">
          Manage your account details and view plan usage.
        </p>
      </header>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Account</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Email</dt>
              <dd>{session.user.email}</dd>
            </div>
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
              <dt className="text-muted-foreground">Credits</dt>
              <dd>
                {balance.creditsRemaining.toLocaleString()} /{" "}
                {balance.creditsTotal.toLocaleString()}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">Plan expires</dt>
              <dd>
                {balance.expiresAt
                  ? format(new Date(balance.expiresAt), "PPP")
                  : "No active plan"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Quick actions</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Need more credits? Visit the {" "}
            <Link className="underline" href="/recharge">
              recharge page
            </Link>
            .
          </p>
          <p className="text-muted-foreground text-sm">
            To see overall analytics, open the {" "}
            <Link className="underline" href="/analytics">
              usage dashboard
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Account email</h2>
            <p className="text-muted-foreground text-sm">
              To change your login email, please contact support.
            </p>
          </div>
          <div className="rounded-md border border-dashed border-input bg-background px-3 py-2 text-sm">
            {session.user.email}
          </div>
        </div>

        <PasswordForm />
      </section>

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Usage</h2>
        <dl className="mt-4 grid gap-4 text-sm md:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Total credits</dt>
            <dd className="text-xl font-semibold">{formatCredits(totals.totalTokens)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Input credits</dt>
            <dd className="text-xl font-semibold">{formatCredits(totals.inputTokens)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Output credits</dt>
            <dd className="text-xl font-semibold">{formatCredits(totals.outputTokens)}</dd>
          </div>
        </dl>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase">
              <tr>
                <th className="py-2 text-left">Day</th>
                <th className="py-2 text-right">Credits used</th>
              </tr>
            </thead>
            <tbody>
              {daily.length === 0 ? (
                <tr>
                  <td className="py-4" colSpan={2}>
                    <p className="text-muted-foreground text-sm">
                      No usage recorded yet.
                    </p>
                  </td>
                </tr>
              ) : (
                daily.map((entry) => {
                  const day =
                    entry.day instanceof Date
                      ? entry.day
                      : new Date(entry.day);
                  return (
                    <tr key={day.toISOString()} className="border-t">
                      <td className="py-2">{format(day, "PPP")}</td>
                      <td className="py-2 text-right">
                        {formatCredits(entry.totalTokens)}
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
