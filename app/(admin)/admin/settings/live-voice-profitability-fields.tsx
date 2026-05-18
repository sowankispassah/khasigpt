"use client";

import { useMemo, useState } from "react";
import { TOKENS_PER_CREDIT } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  calculateLiveVoiceTokensPerInteraction,
  LIVE_VOICE_BASE_CREDIT_UNITS,
  normalizeLiveVoiceCreditMultiplier,
} from "@/lib/voice/live";

type LiveVoiceProfitabilityFieldsProps = {
  initialInputProviderCostPerMillion?: number;
  initialMultiplier?: number;
  initialOutputProviderCostPerMillion?: number;
  inputIdPrefix: string;
  recommendedPlanName?: string | null;
  recommendedPlanPriceInPaise?: number;
  recommendedPlanTokenAllowance?: number;
  usdToInr: number;
};

function formatCredits(value: number) {
  return value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
  });
}

function formatTokens(value: number) {
  return value.toLocaleString("en-IN");
}

function formatUsd(value: number) {
  return value.toLocaleString("en-US", {
    currency: "USD",
    maximumFractionDigits: 6,
    minimumFractionDigits: value >= 1 ? 2 : 4,
    style: "currency",
  });
}

function formatInr(value: number) {
  return value.toLocaleString("en-IN", {
    currency: "INR",
    maximumFractionDigits: 4,
    minimumFractionDigits: value >= 1 ? 2 : 4,
    style: "currency",
  });
}

function parsePositiveNumber(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function LiveVoiceProfitabilityFields({
  initialInputProviderCostPerMillion = 0,
  initialMultiplier = 3,
  initialOutputProviderCostPerMillion = 0,
  inputIdPrefix,
  recommendedPlanName,
  recommendedPlanPriceInPaise = 0,
  recommendedPlanTokenAllowance = 0,
  usdToInr,
}: LiveVoiceProfitabilityFieldsProps) {
  const [multiplier, setMultiplier] = useState(() =>
    String(
      normalizeLiveVoiceCreditMultiplier(
        Number.isFinite(initialMultiplier) && initialMultiplier > 0
          ? initialMultiplier
          : 3
      )
    )
  );
  const [inputCost, setInputCost] = useState(() =>
    String(Math.max(0, initialInputProviderCostPerMillion))
  );
  const [outputCost, setOutputCost] = useState(() =>
    String(Math.max(0, initialOutputProviderCostPerMillion))
  );

  const preview = useMemo(() => {
    const safeMultiplier = normalizeLiveVoiceCreditMultiplier(multiplier);
    const baseCredits = LIVE_VOICE_BASE_CREDIT_UNITS;
    const finalCredits = baseCredits * safeMultiplier;
    const tokensPerInteraction =
      calculateLiveVoiceTokensPerInteraction(safeMultiplier);
    const inputProviderRateUsd = parsePositiveNumber(inputCost);
    const outputProviderRateUsd = parsePositiveNumber(outputCost);
    const providerRateUsd =
      inputProviderRateUsd + outputProviderRateUsd;
    const providerInputCostUsd =
      (inputProviderRateUsd * tokensPerInteraction) / 1_000_000;
    const providerOutputCostUsd =
      (outputProviderRateUsd * tokensPerInteraction) / 1_000_000;
    const providerCostUsd = providerInputCostUsd + providerOutputCostUsd;
    const hasCreditValue =
      recommendedPlanPriceInPaise > 0 &&
      recommendedPlanTokenAllowance > 0 &&
      usdToInr > 0;
    const creditsInRecommendedPlan =
      recommendedPlanTokenAllowance / TOKENS_PER_CREDIT;
    const creditValueInr =
      hasCreditValue && creditsInRecommendedPlan > 0
        ? recommendedPlanPriceInPaise / 100 / creditsInRecommendedPlan
        : 0;
    const creditValueUsd =
      creditValueInr > 0 && usdToInr > 0 ? creditValueInr / usdToInr : 0;
    const revenueInr = finalCredits * creditValueInr;
    const revenueUsd = finalCredits * creditValueUsd;
    const profitUsd = revenueUsd - providerCostUsd;
    const profitInr = profitUsd * usdToInr;
    const marginPercent =
      revenueUsd > 0 ? (profitUsd / revenueUsd) * 100 : null;

    return {
      baseCredits,
      creditValueInr,
      creditValueUsd,
      finalCredits,
      hasCreditValue,
      inputProviderRateUsd,
      marginPercent,
      outputProviderRateUsd,
      profitInr,
      profitUsd,
      providerCostUsd,
      providerInputCostUsd,
      providerOutputCostUsd,
      providerRateUsd,
      revenueInr,
      revenueUsd,
      safeMultiplier,
      tokensPerInteraction,
    };
  }, [
    inputCost,
    multiplier,
    outputCost,
    recommendedPlanPriceInPaise,
    recommendedPlanTokenAllowance,
    usdToInr,
  ]);

  const profitTone =
    preview.marginPercent === null
      ? "text-muted-foreground"
      : preview.profitUsd >= 0
        ? "text-emerald-600"
        : "text-destructive";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <label
          className="font-medium text-sm"
          htmlFor={`${inputIdPrefix}-credit-multiplier`}
        >
          Credit multiplier
        </label>
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          id={`${inputIdPrefix}-credit-multiplier`}
          min={0.01}
          name="creditMultiplier"
          onChange={(event) => setMultiplier(event.target.value)}
          step={0.01}
          type="number"
          value={multiplier}
        />
        <p className="text-muted-foreground text-xs">
          Live Voice multiplies the normal chat base charge. Presets like 1x,
          1.5x, 2x, 2.5x, 3x, and 5x are supported.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label
          className="font-medium text-sm"
          htmlFor={`${inputIdPrefix}-input-cost`}
        >
          Provider input cost (USD / 1M tokens)
        </label>
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          id={`${inputIdPrefix}-input-cost`}
          min={0}
          name="inputProviderCostPerMillion"
          onChange={(event) => setInputCost(event.target.value)}
          step="0.000001"
          type="number"
          value={inputCost}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label
          className="font-medium text-sm"
          htmlFor={`${inputIdPrefix}-output-cost`}
        >
          Provider output cost (USD / 1M tokens)
        </label>
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          id={`${inputIdPrefix}-output-cost`}
          min={0}
          name="outputProviderCostPerMillion"
          onChange={(event) => setOutputCost(event.target.value)}
          step="0.000001"
          type="number"
          value={outputCost}
        />
      </div>

      <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-xs sm:text-sm">
        <p className="font-medium text-foreground">Credit charge preview</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Base charge
            </p>
            <p>{formatCredits(preview.baseCredits)} credit</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Voice multiplier
            </p>
            <p>{preview.safeMultiplier.toFixed(2)}x</p>
          </div>
          <div className="space-y-1">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Final charge
            </p>
            <p>{formatCredits(preview.finalCredits)} credits</p>
          </div>
        </div>
        <p className="mt-3 text-muted-foreground text-xs">
          This deducts about {formatTokens(preview.tokensPerInteraction)}{" "}
          internal usage tokens from the shared credits balance.
        </p>
      </div>

      <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-xs sm:text-sm md:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium text-foreground">
              Live Voice profitability estimate
            </p>
            <p className="mt-1 text-muted-foreground text-xs">
              Credit value uses the current recommended pricing plan
              {recommendedPlanName ? `: ${recommendedPlanName}.` : "."}
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-2 py-1 font-medium text-xs",
              preview.marginPercent === null
                ? "bg-muted text-muted-foreground"
                : preview.profitUsd >= 0
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-700"
            )}
          >
            {preview.marginPercent === null
              ? "Set pricing plan"
              : preview.profitUsd >= 0
                ? "Profitable"
                : "Losing money"}
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <div className="rounded-md border bg-background/80 p-3">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              User charge
            </p>
            <p className="mt-1 font-semibold">
              {formatCredits(preview.finalCredits)} credits
            </p>
          </div>
          <div className="rounded-md border bg-background/80 p-3">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Revenue
            </p>
            <p className="mt-1 font-semibold">
              {preview.hasCreditValue
                ? formatInr(preview.revenueInr)
                : "No plan value"}
            </p>
            {preview.hasCreditValue ? (
              <p className="text-muted-foreground text-xs">
                {formatUsd(preview.revenueUsd)}
              </p>
            ) : null}
          </div>
          <div className="rounded-md border bg-background/80 p-3">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              API cost
            </p>
            <p className="mt-1 font-semibold">
              {formatUsd(preview.providerCostUsd)}
            </p>
            <p className="text-muted-foreground text-xs">
              {formatUsd(preview.providerRateUsd)} / 1M tokens
            </p>
          </div>
          <div className="rounded-md border bg-background/80 p-3">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Profit / loss
            </p>
            <p className={cn("mt-1 font-semibold", profitTone)}>
              {preview.hasCreditValue ? formatInr(preview.profitInr) : "-"}
            </p>
            {preview.hasCreditValue ? (
              <p className="text-muted-foreground text-xs">
                {formatUsd(preview.profitUsd)}
              </p>
            ) : null}
          </div>
          <div className="rounded-md border bg-background/80 p-3">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              Margin
            </p>
            <p className={cn("mt-1 font-semibold", profitTone)}>
              {preview.marginPercent === null
                ? "-"
                : `${preview.marginPercent.toFixed(2)}%`}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 text-muted-foreground text-xs md:grid-cols-3">
          <p>
            Credit value:{" "}
            {preview.hasCreditValue
              ? `${formatInr(preview.creditValueInr)} (${formatUsd(
                  preview.creditValueUsd
                )}) per credit`
              : "select a paid recommended plan to estimate revenue"}
          </p>
          <p>
            Input estimate: {formatUsd(preview.providerInputCostUsd)} from{" "}
            {formatUsd(preview.inputProviderRateUsd)} / 1M.
          </p>
          <p>
            Output estimate: {formatUsd(preview.providerOutputCostUsd)} from{" "}
            {formatUsd(preview.outputProviderRateUsd)} / 1M.
          </p>
        </div>
      </div>
    </div>
  );
}
