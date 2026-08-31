"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { TOKENS_PER_CREDIT } from "@/lib/constants";

type ImageModelPricingFieldsProps = {
  recommendedPlanPriceInPaise?: number;
  recommendedPlanTokenAllowance?: number;
  initialPriceInPaise?: number;
  initialTokensPerImage?: number;
  initialProviderCostPerOutputUsd?: number;
  initialMarkupMultiplier?: number;
  usdToInr?: number;
  inputIdPrefix: string;
};

export function ImageModelPricingFields({
  recommendedPlanPriceInPaise = 0,
  recommendedPlanTokenAllowance = 0,
  initialPriceInPaise = 0,
  initialTokensPerImage = TOKENS_PER_CREDIT,
  initialProviderCostPerOutputUsd = 0,
  initialMarkupMultiplier = 2,
  usdToInr = 0,
  inputIdPrefix,
}: ImageModelPricingFieldsProps) {
  const { translate } = useTranslation();
  const [providerCostPerOutputUsd, setProviderCostPerOutputUsd] = useState(
    String(Math.max(0, initialProviderCostPerOutputUsd))
  );
  const [markupMultiplier, setMarkupMultiplier] = useState(
    String(Math.max(1, initialMarkupMultiplier))
  );

  const preview = useMemo(() => {
    const providerCostUsd = Number(providerCostPerOutputUsd);
    const markup = Number(markupMultiplier);
    const validPlan =
      recommendedPlanPriceInPaise > 0 && recommendedPlanTokenAllowance > 0;
    if (
      !Number.isFinite(providerCostUsd) ||
      providerCostUsd <= 0 ||
      !Number.isFinite(markup) ||
      markup < 1 ||
      !Number.isFinite(usdToInr) ||
      usdToInr <= 0 ||
      !validPlan
    ) {
      return null;
    }

    const customerChargeInr = providerCostUsd * usdToInr * markup;
    const walletUnitsPerInr =
      (recommendedPlanTokenAllowance * 100) / recommendedPlanPriceInPaise;
    const walletUnits = Math.max(
      1,
      Math.ceil(customerChargeInr * walletUnitsPerInr)
    );
    return {
      customerChargeInr,
      credits: walletUnits / TOKENS_PER_CREDIT,
    };
  }, [
    markupMultiplier,
    providerCostPerOutputUsd,
    recommendedPlanPriceInPaise,
    recommendedPlanTokenAllowance,
    usdToInr,
  ]);

  const legacyCredits =
    Math.max(1, initialTokensPerImage) / TOKENS_PER_CREDIT;
  const priceInRupees = preview?.customerChargeInr ?? initialPriceInPaise / 100;
  const creditsPerImage = preview?.credits ?? legacyCredits;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-medium">
          {translate(
            "admin.image_models.provider_cost_per_output",
            "Provider cost (USD / completed image)"
          )}
        </span>
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          id={`${inputIdPrefix}-provider-cost`}
          max={1000}
          min={0}
          name="providerCostPerOutputUsd"
          onChange={(event) => setProviderCostPerOutputUsd(event.target.value)}
          step={0.000001}
          type="number"
          value={providerCostPerOutputUsd}
        />
      </label>

      <label className="flex flex-col gap-2 text-sm">
        <span className="font-medium">
          {translate("admin.image_models.markup", "Customer markup")}
        </span>
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          id={`${inputIdPrefix}-markup`}
          max={20}
          min={1}
          name="markupMultiplier"
          onChange={(event) => setMarkupMultiplier(event.target.value)}
          step={0.01}
          type="number"
          value={markupMultiplier}
        />
      </label>

      <input name="priceInRupees" type="hidden" value={priceInRupees} />
      <input name="creditsPerImage" type="hidden" value={creditsPerImage} />

      <div className="rounded-md border bg-muted/30 p-3 text-sm md:col-span-2">
        {preview ? (
          <p>
            {translate(
              "admin.image_models.cost_plus_preview",
              "Customer charge: ₹{price} · {credits} credits per completed image"
            )
              .replace("{price}", preview.customerChargeInr.toFixed(2))
              .replace("{credits}", preview.credits.toFixed(2))}
          </p>
        ) : (
          <p className="text-amber-700 dark:text-amber-300">
            {translate(
              "admin.image_models.legacy_pricing_warning",
              "Enter a provider cost to enable cost-plus billing. Until then, the legacy {credits}-credit charge remains active."
            ).replace("{credits}", legacyCredits.toFixed(2))}
          </p>
        )}
      </div>
    </div>
  );
}
