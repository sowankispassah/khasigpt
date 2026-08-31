"use client";

import { useMemo, useState } from "react";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { TOKENS_PER_CREDIT } from "@/lib/constants";
import { normalizeLiveVoiceCreditMultiplier } from "@/lib/voice/live";

type LiveVoiceProfitabilityFieldsProps = {
  baselineModelName?: string | null;
  baselineProviderCostPerMillionUsd?: number;
  initialInputProviderCostPerMillion?: number;
  initialMultiplier?: number;
  initialOutputProviderCostPerMillion?: number;
  inputIdPrefix: string;
  recommendedPlanName?: string | null;
  recommendedPlanPriceInPaise?: number;
  recommendedPlanTokenAllowance?: number;
  usdToInr: number;
};

const EXAMPLE_INPUT_TOKENS = 100;
const EXAMPLE_OUTPUT_TOKENS = 100;

function parseNonNegative(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function LiveVoiceProfitabilityFields({
  initialInputProviderCostPerMillion = 0,
  initialMultiplier = 3,
  initialOutputProviderCostPerMillion = 0,
  inputIdPrefix,
  recommendedPlanName = null,
  recommendedPlanPriceInPaise = 0,
  recommendedPlanTokenAllowance = 0,
  usdToInr,
}: LiveVoiceProfitabilityFieldsProps) {
  const [markup, setMarkup] = useState(() =>
    String(normalizeLiveVoiceCreditMultiplier(initialMultiplier))
  );
  const [inputCost, setInputCost] = useState(() =>
    String(Math.max(0, initialInputProviderCostPerMillion))
  );
  const [outputCost, setOutputCost] = useState(() =>
    String(Math.max(0, initialOutputProviderCostPerMillion))
  );

  const preview = useMemo(() => {
    const inputRate = parseNonNegative(inputCost);
    const outputRate = parseNonNegative(outputCost);
    const safeMarkup = normalizeLiveVoiceCreditMultiplier(markup);
    const providerCostUsd =
      (EXAMPLE_INPUT_TOKENS * inputRate +
        EXAMPLE_OUTPUT_TOKENS * outputRate) /
      1_000_000;
    const customerChargeInr = providerCostUsd * usdToInr * safeMarkup;
    const walletUnitsPerInr =
      recommendedPlanPriceInPaise > 0 && recommendedPlanTokenAllowance > 0
        ? (recommendedPlanTokenAllowance * 100) /
          recommendedPlanPriceInPaise
        : 0;
    const walletUnits =
      customerChargeInr > 0 && walletUnitsPerInr > 0
        ? Math.max(1, Math.ceil(customerChargeInr * walletUnitsPerInr))
        : 0;
    return {
      customerChargeInr,
      credits: walletUnits / TOKENS_PER_CREDIT,
      providerCostUsd,
      safeMarkup,
    };
  }, [
    inputCost,
    markup,
    outputCost,
    recommendedPlanPriceInPaise,
    recommendedPlanTokenAllowance,
    usdToInr,
  ]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-medium">
          <EditableTranslation
            defaultText="Customer markup"
            description="Label for the live voice provider-cost markup field."
            translationKey="admin.live_voice.markup_multiplier"
          />
        </span>
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          id={`${inputIdPrefix}-credit-multiplier`}
          max={20}
          min={1}
          name="creditMultiplier"
          onChange={(event) => setMarkup(event.target.value)}
          step={0.01}
          type="number"
          value={markup}
        />
      </label>

      <label className="flex flex-col gap-2 text-sm">
        <span className="font-medium">
          <EditableTranslation
            defaultText="Provider input cost (USD / 1M tokens)"
            description="Live voice provider input-token cost field."
            translationKey="admin.live_voice.input_provider_cost"
          />
        </span>
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          id={`${inputIdPrefix}-input-cost`}
          min={0}
          name="inputProviderCostPerMillion"
          onChange={(event) => setInputCost(event.target.value)}
          step={0.000001}
          type="number"
          value={inputCost}
        />
      </label>

      <label className="flex flex-col gap-2 text-sm">
        <span className="font-medium">
          <EditableTranslation
            defaultText="Provider output cost (USD / 1M tokens)"
            description="Live voice provider output-token cost field."
            translationKey="admin.live_voice.output_provider_cost"
          />
        </span>
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          id={`${inputIdPrefix}-output-cost`}
          min={0}
          name="outputProviderCostPerMillion"
          onChange={(event) => setOutputCost(event.target.value)}
          step={0.000001}
          type="number"
          value={outputCost}
        />
      </label>

      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        <p className="font-medium">
          <EditableTranslation
            defaultText="Cost-plus preview"
            description="Heading for the live voice cost-plus preview."
            translationKey="admin.live_voice.cost_plus_preview"
          />
        </p>
        <p className="mt-2 text-muted-foreground text-xs">
          {EXAMPLE_INPUT_TOKENS} input + {EXAMPLE_OUTPUT_TOKENS} output tokens
          {recommendedPlanName ? ` · ${recommendedPlanName}` : ""}
        </p>
        <p className="mt-2">
          ${preview.providerCostUsd.toFixed(6)} × {preview.safeMarkup.toFixed(2)} =
          ₹{preview.customerChargeInr.toFixed(4)} · {preview.credits.toFixed(2)} credits
        </p>
      </div>
    </div>
  );
}
