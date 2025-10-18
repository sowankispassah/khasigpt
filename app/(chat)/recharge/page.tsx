"use server";

import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { rechargeSubscriptionAction } from "@/app/(chat)/actions";
import { Button } from "@/components/ui/button";
import {
  getUserBalanceSummary,
  listPricingPlans,
} from "@/lib/db/queries";
import { TOKENS_PER_CREDIT } from "@/lib/constants";

export default async function RechargePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/recharge");
  }

  const [plans, balance] = await Promise.all([
    listPricingPlans({ includeInactive: false }),
    getUserBalanceSummary(session.user.id),
  ]);

  const activePlanId = balance.plan?.id ?? null;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Recharge credits</h1>
        <p className="text-muted-foreground text-sm">
          Choose a plan to top up your account. Credits are consumed as you send
          or receive messages.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        {plans.map((plan) => {
          const priceInRupees = plan.priceInPaise / 100;
          const credits = Math.floor(plan.tokenAllowance / TOKENS_PER_CREDIT);
          const isActive = activePlanId === plan.id;

          return (
            <div
              key={plan.id}
              className="flex h-full flex-col justify-between rounded-lg border bg-card p-4 shadow-sm"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">{plan.name}</h2>
                  <span className="text-muted-foreground text-xs uppercase">
                    {plan.billingCycleDays} day plan
                  </span>
                </div>
                {plan.description && (
                  <p className="text-muted-foreground text-sm">
                    {plan.description}
                  </p>
                )}
                <div className="mt-3 space-y-1 text-sm">
                  <p>
                    <span className="font-medium">
                      INR{" "}
                      {priceInRupees.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>{" "}
                    for{" "}
                    <span className="font-medium">
                      {plan.tokenAllowance.toLocaleString()} tokens
                    </span>
                    .
                  </p>
                  <p className="text-muted-foreground">
                    Displayed as{" "}
                    <span className="font-medium">
                      {credits.toLocaleString()} credits
                    </span>{" "}
                    (1 credit = {TOKENS_PER_CREDIT} tokens)
                  </p>
                </div>
              </div>

              <form action={rechargeSubscriptionAction} className="mt-6">
                <input name="planId" type="hidden" value={plan.id} />
                <Button
                  className="w-full"
                  disabled={isActive}
                  type="submit"
                >
                  {isActive ? "Current Plan" : "Activate Plan"}
                </Button>
              </form>
            </div>
          );
        })}
      </section>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Current balance</h2>
        <dl className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-xs uppercase">
              Credits remaining
            </dt>
            <dd className="mt-1 text-xl font-semibold">
              {balance.creditsRemaining.toLocaleString()}{" "}
              <span className="text-muted-foreground text-sm font-normal">
                / {balance.creditsTotal.toLocaleString()}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs uppercase">
              Tokens remaining
            </dt>
            <dd className="mt-1 text-xl font-semibold">
              {balance.tokensRemaining.toLocaleString()}{" "}
              <span className="text-muted-foreground text-sm font-normal">
                / {balance.tokensTotal.toLocaleString()}
              </span>
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
