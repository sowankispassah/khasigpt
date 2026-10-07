"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { BackToHomeButton } from "@/app/(chat)/profile/back-to-home-button";
import { AccountPageShell } from "@/components/account/account-ui";
import { RechargePlans } from "@/components/recharge-plans";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { loadPricingReadModel } from "@/lib/api/read-models";
import { getUserBalanceSummary } from "@/lib/db/queries";
import {
  getTranslationValuesForKeys,
} from "@/lib/i18n/dictionary";
import { couponsAllowed } from "@/lib/referrals/settings";
import { withTimeout } from "@/lib/utils/async";
import { getChatRouteSession } from "../chat-route-session";
import {
  RechargeBalanceCard,
  RechargeHowItWorks,
  RechargePartialNotice,
  RechargeUnavailable,
} from "./recharge-view";

const PRICING_TIMEOUT_MS = 7000;
const BALANCE_TIMEOUT_MS = 7000;
const PLAN_TRANSLATIONS_TIMEOUT_MS = 4000;

export default async function RechargePage() {
  const session = await getChatRouteSession();

  if (!session?.user) {
    redirect("/login?callbackUrl=/recharge");
  }

  const couponsEnabled = await couponsAllowed(session.user.role).catch(() => false);
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;

  const [pricing, balance] = await Promise.all([
    withTimeout(loadPricingReadModel(), PRICING_TIMEOUT_MS, () => {
      console.error("[recharge] Pricing read timed out.", {
        timeoutMs: PRICING_TIMEOUT_MS,
      });
    }).catch((error) => {
      console.error("[recharge] Pricing read failed.", error);
      return null;
    }),
    withTimeout(getUserBalanceSummary(session.user.id), BALANCE_TIMEOUT_MS, () => {
      console.error("[recharge] Balance read timed out.", {
        timeoutMs: BALANCE_TIMEOUT_MS,
      });
    }).catch((error) => {
      console.error("[recharge] Balance read failed.", error);
      return null;
    }),
  ]);

  if (!pricing) {
    return <RechargeUnavailablePage />;
  }

  const {
    imageGenerationEnabledForAll,
    plans,
    recommendedPlanId: recommendedPlanSetting,
  } = pricing;

  const planTranslationKeys = plans.flatMap((plan) => [
    `recharge.plan.${plan.id}.name`,
    `recharge.plan.${plan.id}.description`,
  ]);

  const planTranslations =
    planTranslationKeys.length > 0
      ? await withTimeout(
          getTranslationValuesForKeys(preferredLanguage, planTranslationKeys),
          PLAN_TRANSLATIONS_TIMEOUT_MS,
          () => {
            console.error("[recharge] Plan translation read timed out.", {
              timeoutMs: PLAN_TRANSLATIONS_TIMEOUT_MS,
            });
          }
        ).catch((error) => {
          console.error("[recharge] Plan translation read failed.", error);
          return {} as Record<string, string>;
        })
      : ({} as Record<string, string>);

  const activePlanId = balance?.plan?.id ?? null;
  const sortedPlans = [...plans].sort((a, b) => {
    if (a.priceInPaise === b.priceInPaise) {
      return a.tokenAllowance - b.tokenAllowance;
    }
    return a.priceInPaise - b.priceInPaise;
  });

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

  const localizedPlans = sortedPlans.map((plan) => {
    const nameKey = `recharge.plan.${plan.id}.name`;
    const descriptionKey = `recharge.plan.${plan.id}.description`;

    const localizedName = planTranslations[nameKey]?.trim().length
      ? planTranslations[nameKey]
      : plan.name;

    const rawDescription = plan.description ?? "";
    const translatedDescription =
      planTranslations[descriptionKey]?.trim() ?? "";
    const localizedDescription =
      translatedDescription.length > 0
        ? translatedDescription
        : rawDescription.trim().length > 0
          ? rawDescription
          : null;

    return {
      ...plan,
      name: localizedName,
      description: localizedDescription,
    };
  });

  return (
    <RechargePageFrame>
      {!balance ? <RechargePartialNotice /> : null}
      <RechargeBalanceCard
        balance={
          balance
            ? {
                creditsRemaining: balance.creditsRemaining,
                creditsTotal: balance.creditsTotal,
                expiresAt: balance.expiresAt,
              }
            : null
        }
      />
      <RechargePlans
        couponsEnabled={couponsEnabled}
        activePlanId={activePlanId}
        imageGenerationEnabledForAll={imageGenerationEnabledForAll}
        plans={localizedPlans.map((plan) => ({
          id: plan.id,
          name: plan.name,
          description: plan.description,
          priceInPaise: plan.priceInPaise,
          tokenAllowance: plan.tokenAllowance,
          billingCycleDays: plan.billingCycleDays,
          isActive: plan.isActive,
        }))}
        recommendedPlanId={recommendedPlanId}
        user={{
          name: session.user.name ?? null,
          email: session.user.email ?? null,
          contact: null,
        }}
      />
      <RechargeHowItWorks />
    </RechargePageFrame>
  );
}

function RechargePageFrame({ children }: { children: ReactNode }) {
  return (
    <AccountPageShell
      back={
        <BackToHomeButton
          label="Back to home"
          translationKey="navigation.back_to_home"
          variant="pill"
        />
      }
      description={
        <EditableTranslation
          defaultText="Unlock more capacity and features by picking a plan that scales with your needs. Activate instantly and start building without interruption."
          translationKey="recharge.subtitle"
        />
      }
      eyebrow={
        <EditableTranslation defaultText="Pricing" translationKey="recharge.tagline" />
      }
      title={
        <EditableTranslation
          defaultText="Choose your plan"
          translationKey="recharge.title"
        />
      }
    >
      {children}
    </AccountPageShell>
  );
}

function RechargeUnavailablePage() {
  return (
    <RechargePageFrame>
      <RechargeUnavailable />
    </RechargePageFrame>
  );
}
