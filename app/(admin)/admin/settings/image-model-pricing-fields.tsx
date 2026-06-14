"use client";

import { useEffect, useMemo, useState } from "react";
import { TOKENS_PER_CREDIT } from "@/lib/constants";

type ImageModelPricingFieldsProps = {
  recommendedPlanPriceInPaise?: number;
  recommendedPlanTokenAllowance?: number;
  initialPriceInPaise?: number;
  initialTokensPerImage?: number;
  inputIdPrefix: string;
};

export function ImageModelPricingFields({
  recommendedPlanPriceInPaise = 0,
  recommendedPlanTokenAllowance = 0,
  initialPriceInPaise,
  initialTokensPerImage,
  inputIdPrefix,
}: ImageModelPricingFieldsProps) {
  const initialCredits =
    typeof initialTokensPerImage === "number" && initialTokensPerImage > 0
      ? initialTokensPerImage / TOKENS_PER_CREDIT
      : 1;

  const [priceInRupees, setPriceInRupees] = useState<string>(() =>
    typeof initialPriceInPaise === "number" && initialPriceInPaise > 0
      ? (initialPriceInPaise / 100).toString()
      : ""
  );
  const [creditsPerImage, setCreditsPerImage] = useState<string>(() =>
    initialCredits.toFixed(2)
  );

  useEffect(() => {
    if (typeof initialPriceInPaise === "number") {
      setPriceInRupees(
        initialPriceInPaise > 0
          ? (initialPriceInPaise / 100).toString()
          : ""
      );
    }
  }, [initialPriceInPaise]);

  useEffect(() => {
    if (typeof initialTokensPerImage === "number") {
      const nextCredits =
        initialTokensPerImage > 0
          ? initialTokensPerImage / TOKENS_PER_CREDIT
          : 1;
      setCreditsPerImage(nextCredits.toFixed(2));
    }
  }, [initialTokensPerImage]);

  const creditPricePaise = useMemo(() => {
    if (
      !recommendedPlanPriceInPaise ||
      recommendedPlanPriceInPaise <= 0 ||
      !recommendedPlanTokenAllowance ||
      recommendedPlanTokenAllowance <= 0
    ) {
      return null;
    }

    const creditsInPlan = recommendedPlanTokenAllowance / TOKENS_PER_CREDIT;
    if (!creditsInPlan) {
      return null;
    }

    return recommendedPlanPriceInPaise / creditsInPlan;
  }, [recommendedPlanPriceInPaise, recommendedPlanTokenAllowance]);

  const derivedCredits = useMemo(() => {
    if (!creditPricePaise) {
      return null;
    }
    const price = Number(priceInRupees);
    if (!Number.isFinite(price) || price <= 0) {
      return null;
    }

    const pricePerTokenPaise = creditPricePaise / TOKENS_PER_CREDIT;
    if (!pricePerTokenPaise || pricePerTokenPaise <= 0) {
      return null;
    }

    const tokens = Math.ceil((price * 100) / pricePerTokenPaise);
    return tokens / TOKENS_PER_CREDIT;
  }, [priceInRupees, creditPricePaise]);

  useEffect(() => {
    if (derivedCredits === null) {
      return;
    }
    setCreditsPerImage(derivedCredits.toFixed(2));
  }, [derivedCredits]);

  const tokensPreview = useMemo(() => {
    const credits = Number(creditsPerImage);
    if (!Number.isFinite(credits) || credits <= 0) {
      return 0;
    }
    return Math.max(1, Math.round(credits * TOKENS_PER_CREDIT));
  }, [creditsPerImage]);

  const creditsReadOnly = derivedCredits !== null;
  const showConversionHint = creditPricePaise === null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <label className="font-medium text-sm" htmlFor={`${inputIdPrefix}-price`}>
          Price per image (INR)
        </label>
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          id={`${inputIdPrefix}-price`}
          min={0}
          name="priceInRupees"
          onChange={(event) => setPriceInRupees(event.target.value)}
          placeholder="10"
          step={0.01}
          type="number"
          value={priceInRupees}
        />
        {showConversionHint ? (
          <p className="text-muted-foreground text-xs">
            Set a recommended pricing plan to auto-calculate credits from INR.
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            Credits auto-update based on the recommended plan.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className="font-medium text-sm" htmlFor={`${inputIdPrefix}-credits`}>
          Credits per image
        </label>
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          id={`${inputIdPrefix}-credits`}
          min={0.01}
          name="creditsPerImage"
          onChange={(event) => setCreditsPerImage(event.target.value)}
          readOnly={creditsReadOnly}
          step={0.01}
          type="number"
          value={creditsPerImage}
        />
        <p className="text-muted-foreground text-xs">
          {tokensPreview
            ? `~ ${tokensPreview.toLocaleString()} tokens will be deducted`
            : `Credits convert to tokens at ${TOKENS_PER_CREDIT} tokens per credit.`}
        </p>
      </div>
    </div>
  );
}
