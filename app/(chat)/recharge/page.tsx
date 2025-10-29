"use server";

import { redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import { Button } from "@/components/ui/button";
import { PageUserMenu } from "@/components/page-user-menu";
import { RechargePlans } from "@/components/recharge-plans";
import {
  getUserBalanceSummary,
  listPricingPlans,
  getAppSetting,
} from "@/lib/db/queries";
import { RECOMMENDED_PRICING_PLAN_SETTING_KEY } from "@/lib/constants";

export default async function RechargePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/recharge");
  }

  const [plans, balance, recommendedPlanSetting] = await Promise.all([
    listPricingPlans({ includeInactive: false }),
    getUserBalanceSummary(session.user.id),
    getAppSetting<string | null>(RECOMMENDED_PRICING_PLAN_SETTING_KEY),
  ]);

  const activePlanId = balance.plan?.id ?? null;
  const sortedPlans = [...plans].sort((a, b) => {
    if (a.priceInPaise === b.priceInPaise) {
      return a.tokenAllowance - b.tokenAllowance;
    }
    return a.priceInPaise - b.priceInPaise;
  });

  let recommendedPlanId: string | null =
    recommendedPlanSetting && sortedPlans.some((plan) => plan.id === recommendedPlanSetting)
      ? recommendedPlanSetting
      : null;

  if (!recommendedPlanId) {
    let highestPrice = -Infinity;
    let highestAllowance = -Infinity;
    for (const plan of sortedPlans) {
      if (
        plan.priceInPaise > highestPrice ||
        (plan.priceInPaise === highestPrice && plan.tokenAllowance > highestAllowance)
      ) {
        recommendedPlanId = plan.id;
        highestPrice = plan.priceInPaise;
        highestAllowance = plan.tokenAllowance;
      }
    }
  }

  const expiryFormatter = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-12">
      <PageUserMenu />
      <header className="flex flex-col gap-6">
        <div>
          <Button asChild variant="link" className="px-0 text-sm font-medium">
            <a className="inline-flex items-center gap-2 text-primary underline-offset-4 hover:underline" href="/">
              &larr; Back to home
            </a>
          </Button>
        </div>
        <div className="mx-auto flex max-w-2xl flex-col gap-3 text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Pricing
          </span>
          <h1 className="text-3xl font-semibold md:text-4xl">Choose your plan</h1>
          <p className="text-muted-foreground text-sm md:text-base">
            Unlock more capacity and features by picking a plan that scales with your
            needs. Activate instantly and start building without interruption.
          </p>
        </div>
      </header>

      <RechargePlans
        plans={sortedPlans.map((plan) => ({
          id: plan.id,
          name: plan.name,
          description: plan.description,
          priceInPaise: plan.priceInPaise,
          tokenAllowance: plan.tokenAllowance,
          billingCycleDays: plan.billingCycleDays,
          isActive: plan.isActive,
        }))}
        activePlanId={activePlanId}
        recommendedPlanId={recommendedPlanId}
        user={{
          name: session.user.name ?? null,
          email: session.user.email ?? null,
          contact: null,
        }}
      />

      <section className="rounded-2xl border bg-card/80 p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Current balance</h2>
        <dl className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-xs uppercase tracking-wide">
              Credits remaining
            </dt>
            <dd className="mt-2 text-2xl font-semibold">
              {balance.creditsRemaining.toLocaleString()}{" "}
              <span className="text-muted-foreground text-sm font-normal">
                / {balance.creditsTotal.toLocaleString()}
              </span>
            </dd>
          </div>
          {balance.expiresAt ? (
            <div>
              <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                Credits valid until
              </dt>
              <dd className="mt-2 text-lg font-semibold">
                {expiryFormatter.format(balance.expiresAt)}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>
    </div>
  );
}


