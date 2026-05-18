import { NextResponse } from "next/server";
import { isImageGenerationEnabledForAllUsers } from "@/lib/ai/image-generation";
import { sortPricingPlansForDisplay } from "@/lib/billing/pricing-plans";
import { RECOMMENDED_PRICING_PLAN_SETTING_KEY } from "@/lib/constants";
import {
  getAppSetting,
  getUserBalanceSummary,
  listPricingPlans,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { getAndroidProductIdForPlan } from "@/lib/payments/google-play-products";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const serializeDate = (value: Date | string | null | undefined) =>
  value instanceof Date ? value.toISOString() : value ?? null;

export async function GET(request: Request) {
  const session = await getMobileSession(request);
  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const [
    plans,
    balance,
    recommendedPlanSetting,
    imageGenerationEnabledForAll,
  ] = await Promise.all([
    listPricingPlans({ includeInactive: false }),
    getUserBalanceSummary(session.user.id),
    getAppSetting<string | null>(RECOMMENDED_PRICING_PLAN_SETTING_KEY),
    isImageGenerationEnabledForAllUsers(),
  ]);

  const sortedPlans = sortPricingPlansForDisplay(plans);

  let recommendedPlanId: string | null =
    recommendedPlanSetting &&
    sortedPlans.some((plan) => plan.id === recommendedPlanSetting)
      ? recommendedPlanSetting
      : null;

  if (!recommendedPlanId) {
    let highestPrice = Number.NEGATIVE_INFINITY;
    let highestAllowance = Number.NEGATIVE_INFINITY;
    for (const plan of sortedPlans) {
      if (
        plan.priceInPaise > highestPrice ||
        (plan.priceInPaise === highestPrice &&
          plan.tokenAllowance > highestAllowance)
      ) {
        recommendedPlanId = plan.id;
        highestPrice = plan.priceInPaise;
        highestAllowance = plan.tokenAllowance;
      }
    }
  }

  return NextResponse.json(
    {
      activePlanId: balance.plan?.id ?? null,
      imageGenerationEnabledForAll,
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
      plans: sortedPlans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        priceInPaise: plan.priceInPaise,
        androidProductId:
          plan.priceInPaise > 0 ? getAndroidProductIdForPlan(plan) : null,
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
