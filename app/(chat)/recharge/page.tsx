"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import { BackToHomeButton } from "@/app/(chat)/profile/back-to-home-button";
import { RechargePlans } from "@/components/recharge-plans";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { loadPricingReadModel } from "@/lib/api/read-models";
import { getUserBalanceSummary } from "@/lib/db/queries";
import {
  getTranslationValuesForKeys,
} from "@/lib/i18n/dictionary";

export default async function RechargePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/recharge");
  }

  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;

  const [pricing, balance] = await Promise.all([
    loadPricingReadModel(),
    getUserBalanceSummary(session.user.id),
  ]);
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
      ? await getTranslationValuesForKeys(preferredLanguage, planTranslationKeys)
      : {};

  const formatCreditValue = (credits: number) =>
    credits.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const activePlanId = balance.plan?.id ?? null;
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

  const expiryFormatter = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  });
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-12">
      <header className="flex flex-col gap-6">
        <div>
          <BackToHomeButton
            label="Back to home"
            translationKey="navigation.back_to_home"
          />
        </div>
        <div className="mx-auto flex max-w-2xl flex-col gap-3 text-center">
          <span className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
            <EditableTranslation defaultText="Pricing" translationKey="recharge.tagline" />
          </span>
          <h1 className="font-semibold text-3xl md:text-4xl">
            <EditableTranslation
              defaultText="Choose your plan"
              translationKey="recharge.title"
            />
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            <EditableTranslation
              defaultText="Unlock more capacity and features by picking a plan that scales with your needs. Activate instantly and start building without interruption."
              translationKey="recharge.subtitle"
            />
          </p>
        </div>
      </header>

      <RechargePlans
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

      <section className="rounded-2xl border bg-card/80 p-6 shadow-sm">
        <h2 className="font-semibold text-lg">
          <EditableTranslation
            defaultText="Current balance"
            translationKey="recharge.current_balance.title"
          />
        </h2>
        <dl className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-xs uppercase tracking-wide">
              <EditableTranslation
                defaultText="Credits remaining"
                translationKey="recharge.current_balance.remaining"
              />
            </dt>
            <dd className="mt-2 font-semibold text-2xl">
              {formatCreditValue(balance.creditsRemaining)}{" "}
              <span className="font-normal text-muted-foreground text-sm">
                / {formatCreditValue(balance.creditsTotal)}
              </span>
            </dd>
          </div>
          {balance.expiresAt ? (
            <div>
              <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                <EditableTranslation
                  defaultText="Credits valid until"
                  translationKey="recharge.current_balance.valid_until"
                />
              </dt>
              <dd className="mt-2 font-semibold text-lg">
                {expiryFormatter.format(balance.expiresAt)}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>
    </div>
  );
}
