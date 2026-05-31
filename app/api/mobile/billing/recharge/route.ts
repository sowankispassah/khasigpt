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
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RECHARGE_CRITICAL_READ_TIMEOUT_MS = 9000;
const RECHARGE_OPTIONAL_READ_TIMEOUT_MS = 5000;

const serializeDate = (value: Date | string | null | undefined) =>
  value instanceof Date ? value.toISOString() : value ?? null;

export async function GET(request: Request) {
  const session = await getMobileSession(request);
  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const degradedSections: string[] = [];
  const [plans, balance, recommendedPlanSetting, imageGenerationEnabledForAll] =
    await Promise.all([
      withTimeout(
        listPricingPlans({ includeInactive: false }),
        RECHARGE_CRITICAL_READ_TIMEOUT_MS,
        () => {
          console.error(
            "[api/mobile/billing/recharge] Pricing plans read timed out.",
            {
              timeoutMs: RECHARGE_CRITICAL_READ_TIMEOUT_MS,
            }
          );
        }
      ).catch((error) => {
        console.error(
          "[api/mobile/billing/recharge] Pricing plans read failed.",
          error
        );
        return null;
      }),
      withTimeout(
        getUserBalanceSummary(session.user.id),
        RECHARGE_CRITICAL_READ_TIMEOUT_MS,
        () => {
          console.error("[api/mobile/billing/recharge] Balance read timed out.", {
            timeoutMs: RECHARGE_CRITICAL_READ_TIMEOUT_MS,
          });
        }
      ).catch((error) => {
        console.error("[api/mobile/billing/recharge] Balance read failed.", error);
        return null;
      }),
      withTimeout(
        getAppSetting<string | null>(RECOMMENDED_PRICING_PLAN_SETTING_KEY),
        RECHARGE_OPTIONAL_READ_TIMEOUT_MS,
        () => {
          console.error(
            "[api/mobile/billing/recharge] Recommended plan read timed out.",
            {
              timeoutMs: RECHARGE_OPTIONAL_READ_TIMEOUT_MS,
            }
          );
        }
      ).catch((error) => {
        console.error(
          "[api/mobile/billing/recharge] Recommended plan read failed.",
          error
        );
        degradedSections.push("recommendedPlan");
        return null;
      }),
      withTimeout(
        isImageGenerationEnabledForAllUsers(),
        RECHARGE_OPTIONAL_READ_TIMEOUT_MS,
        () => {
          console.error(
            "[api/mobile/billing/recharge] Image generation setting read timed out.",
            {
              timeoutMs: RECHARGE_OPTIONAL_READ_TIMEOUT_MS,
            }
          );
        }
      ).catch((error) => {
        console.error(
          "[api/mobile/billing/recharge] Image generation setting read failed.",
          error
        );
        degradedSections.push("imageGenerationEnabledForAll");
        return false;
      }),
    ]);

  if (!plans || !balance) {
    return NextResponse.json(
      {
        meta: {
          degraded: true,
          degradedSections: [
            !plans ? "plans" : null,
            !balance ? "balance" : null,
          ].filter((section): section is string => Boolean(section)),
        },
        message: "Recharge plans could not be loaded right now. Please retry.",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status: 503,
      }
    );
  }

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
      meta: {
        degraded: degradedSections.length > 0,
        degradedSections,
      },
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
