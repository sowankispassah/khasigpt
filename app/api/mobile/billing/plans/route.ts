import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { RECOMMENDED_PRICING_PLAN_SETTING_KEY } from "@/lib/constants";
import {
  getAppSetting,
  getUserBalanceSummary,
  listPricingPlans,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const serializeDate = (value: Date | string | null | undefined) =>
  value instanceof Date ? value.toISOString() : value ?? null;

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const [plans, balance, recommendedPlanId] = await Promise.all([
    listPricingPlans({ includeInactive: false }),
    getUserBalanceSummary(session.user.id),
    getAppSetting<string | null>(RECOMMENDED_PRICING_PLAN_SETTING_KEY),
  ]);

  return NextResponse.json(
    {
      recommendedPlanId,
      balance: {
        tokensRemaining: balance.tokensRemaining,
        tokensTotal: balance.tokensTotal,
        creditsRemaining: balance.creditsRemaining,
        creditsTotal: balance.creditsTotal,
        allocatedCredits: balance.allocatedCredits,
        rechargedCredits: balance.rechargedCredits,
        expiresAt: serializeDate(balance.expiresAt),
        startedAt: serializeDate(balance.startedAt),
        plan: balance.plan
          ? {
              id: balance.plan.id,
              name: balance.plan.name,
              priceInPaise: balance.plan.priceInPaise,
              billingCycleDays: balance.plan.billingCycleDays,
            }
          : null,
      },
      plans: plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        priceInPaise: plan.priceInPaise,
        tokenAllowance: plan.tokenAllowance,
        billingCycleDays: plan.billingCycleDays,
        isActive: plan.isActive,
      })),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
