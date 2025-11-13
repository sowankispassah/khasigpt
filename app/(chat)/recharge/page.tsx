"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { auth } from "@/app/(auth)/auth";
import { RechargePlans } from "@/components/recharge-plans";
import {
  getUserBalanceSummary,
  listPricingPlans,
  getAppSetting,
} from "@/lib/db/queries";
import { RECOMMENDED_PRICING_PLAN_SETTING_KEY } from "@/lib/constants";
import {
  getTranslationBundle,
  getTranslationsForKeys,
} from "@/lib/i18n/dictionary";
import { BackToHomeButton } from "@/app/(chat)/profile/back-to-home-button";

export default async function RechargePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/recharge");
  }

  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;

  const [plans, balance, recommendedPlanSetting] = await Promise.all([
    listPricingPlans({ includeInactive: false }),
    getUserBalanceSummary(session.user.id),
    getAppSetting<string | null>(RECOMMENDED_PRICING_PLAN_SETTING_KEY),
  ]);

  const planTranslationDefinitions = plans.flatMap((plan) => [
    {
      key: `recharge.plan.${plan.id}.name`,
      defaultText: plan.name,
      description: `Pricing plan name for ${plan.name}`,
    },
    {
      key: `recharge.plan.${plan.id}.description`,
      defaultText: plan.description ?? "",
      description: `Pricing plan details for ${plan.name}`,
    },
  ]);

  const [bundle, planTranslations] = await Promise.all([
    getTranslationBundle(preferredLanguage),
    planTranslationDefinitions.length > 0
      ? getTranslationsForKeys(preferredLanguage, planTranslationDefinitions)
      : Promise.resolve<Record<string, string>>({}),
  ]);

  const dictionary = bundle.dictionary;

  const t = (key: string, fallback: string) => dictionary[key] ?? fallback;
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
  const localizedPlans = sortedPlans.map((plan) => {
    const nameKey = `recharge.plan.${plan.id}.name`;
    const descriptionKey = `recharge.plan.${plan.id}.description`;

    const localizedName =
      planTranslations[nameKey]?.trim().length
        ? planTranslations[nameKey]
        : plan.name;

    const rawDescription = plan.description ?? "";
    const translatedDescription = planTranslations[descriptionKey]?.trim() ?? "";
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
          <BackToHomeButton label={t("navigation.back_to_home", "Back to home")} />
        </div>
        <div className="mx-auto flex max-w-2xl flex-col gap-3 text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("recharge.tagline", "Pricing")}
          </span>
          <h1 className="text-3xl font-semibold md:text-4xl">
            {t("recharge.title", "Choose your plan")}
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            {t(
              "recharge.subtitle",
              "Unlock more capacity and features by picking a plan that scales with your needs. Activate instantly and start building without interruption."
            )}
          </p>
        </div>
      </header>

      <RechargePlans
        plans={localizedPlans.map((plan) => ({
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
        <h2 className="text-lg font-semibold">
          {t("recharge.current_balance.title", "Current balance")}
        </h2>
        <dl className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-xs uppercase tracking-wide">
              {t("recharge.current_balance.remaining", "Credits remaining")}
            </dt>
            <dd className="mt-2 text-2xl font-semibold">
              {formatCreditValue(balance.creditsRemaining)}{" "}
              <span className="text-muted-foreground text-sm font-normal">
                / {formatCreditValue(balance.creditsTotal)}
              </span>
            </dd>
          </div>
          {balance.expiresAt ? (
            <div>
              <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                {t("recharge.current_balance.valid_until", "Credits valid until")}
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


