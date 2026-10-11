"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type CreditPlanForConversion,
  calculatePlanModelEconomics,
  selectBaseCreditPlan,
} from "@/lib/billing/cost-plus";
import { TOKENS_PER_CREDIT } from "@/lib/constants";
import { cn } from "@/lib/utils";

const currencyFormatter = (value: number, currency: "INR" | "USD"): string => {
  return value.toLocaleString(currency === "USD" ? "en-US" : "en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export type ModelCostPreview = {
  id: string;
  inputCostPerMillionUsd: number;
  isDefault: boolean;
  markupMultiplier: number;
  name: string;
  outputCostPerMillionUsd: number;
  providerLabel: string;
};

type PlanPricingFieldsProps = {
  /** Active plans other than this one; the base plan is chosen from these. */
  basePlanCandidates: CreditPlanForConversion[];
  /** Whether this plan, once saved, can become the base conversion plan. */
  includeDraftInBase: boolean;
  modelCosts: ModelCostPreview[];
  usdToInr: number;
  initialPriceInRupees?: number;
  initialTokenAllowance?: number;
  inputIdPrefix?: string;
};

export function PlanPricingFields({
  basePlanCandidates,
  includeDraftInBase,
  modelCosts,
  usdToInr,
  initialPriceInRupees,
  initialTokenAllowance,
  inputIdPrefix = "plan",
}: PlanPricingFieldsProps) {
  const [priceInRupees, setPriceInRupees] = useState<string>(() =>
    typeof initialPriceInRupees === "number"
      ? initialPriceInRupees.toString()
      : ""
  );
  const [tokenAllowance, setTokenAllowance] = useState<string>(() =>
    typeof initialTokenAllowance === "number"
      ? initialTokenAllowance.toString()
      : ""
  );

  useEffect(() => {
    if (typeof initialPriceInRupees === "number") {
      setPriceInRupees(initialPriceInRupees.toString());
    }
  }, [initialPriceInRupees]);

  useEffect(() => {
    if (typeof initialTokenAllowance === "number") {
      setTokenAllowance(initialTokenAllowance.toString());
    }
  }, [initialTokenAllowance]);

  const preview = useMemo(() => {
    const price = Number(priceInRupees);
    const units = Number(tokenAllowance);

    if (
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(units) ||
      units <= 0
    ) {
      return null;
    }

    const draftPlan = {
      priceInPaise: Math.round(price * 100),
      tokenAllowance: units,
    };
    const basePlan = selectBaseCreditPlan(
      includeDraftInBase
        ? [...basePlanCandidates, draftPlan]
        : basePlanCandidates
    );
    const credits = units / TOKENS_PER_CREDIT;
    const baseCreditInr = basePlan
      ? basePlan.priceInPaise / 100 / (basePlan.tokenAllowance / TOKENS_PER_CREDIT)
      : null;
    return {
      basePlan,
      baseCreditInr,
      creditInr: price / credits,
      draftPlan,
      isBase: basePlan === draftPlan,
    };
  }, [basePlanCandidates, includeDraftInBase, priceInRupees, tokenAllowance]);

  const modelBreakdowns = useMemo(() => {
    if (!preview) {
      return [];
    }

    return modelCosts.flatMap((model) => {
      const economics = calculatePlanModelEconomics({
        basePlan: preview.basePlan,
        inputCostPerMillionUsd: model.inputCostPerMillionUsd,
        markupMultiplier: model.markupMultiplier,
        outputCostPerMillionUsd: model.outputCostPerMillionUsd,
        plan: preview.draftPlan,
        usdToInr,
      });
      return economics ? [{ ...model, economics }] : [];
    });
  }, [preview, modelCosts, usdToInr]);

  const handlePriceChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setPriceInRupees(event.target.value);
  };

  const handleAllowanceChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setTokenAllowance(event.target.value);
  };

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="font-medium text-sm" htmlFor="plan-price">
            Price (INR)
          </label>
          <input
            className="h-10 rounded-lg border bg-background px-3 text-sm"
            id={`${inputIdPrefix}-price`}
            min="0"
            name="priceInRupees"
            onChange={handlePriceChange}
            placeholder="299"
            required
            step="0.01"
            type="number"
            value={priceInRupees}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="font-medium text-sm" htmlFor="plan-tokens">
            Credit units
          </label>
          <input
            className="h-10 rounded-lg border bg-background px-3 text-sm"
            id={`${inputIdPrefix}-tokens`}
            min={0}
            name="tokenAllowance"
            onChange={handleAllowanceChange}
            placeholder="100000"
            required
            type="number"
            value={tokenAllowance}
          />
          <p className="text-muted-foreground text-xs">
            {Number.isFinite(Number(tokenAllowance)) &&
            Number(tokenAllowance) > 0
              ? `~ ${(Number(tokenAllowance) / TOKENS_PER_CREDIT).toLocaleString("en-IN")} credits (${TOKENS_PER_CREDIT} units = 1 credit)`
              : `Credits auto-calculate at ${TOKENS_PER_CREDIT} units per credit.`}
          </p>
        </div>
      </div>
      <div className="rounded-lg bg-muted/40 p-4 text-xs leading-relaxed sm:text-sm">
        {preview ? (
          <>
            <p className="font-medium text-foreground">
              Price per credit:
              <span className="ml-1 font-semibold">
                {currencyFormatter(preview.creditInr, "INR")}
              </span>
            </p>
            <p className="mt-1 text-muted-foreground">
              {preview.isBase
                ? "This plan sets the base credit price, so customers pay exactly each model's configured markup."
                : preview.baseCreditInr !== null
                  ? `Charges convert to credits at the base plan price of ${currencyFormatter(preview.baseCreditInr, "INR")} per credit. ${
                      preview.creditInr < preview.baseCreditInr
                        ? `This plan's bonus credits give its buyers ${((1 - preview.creditInr / preview.baseCreditInr) * 100).toFixed(1)}% off, which lowers the realized markup.`
                        : "Buyers of this plan pay the full configured markup."
                    }`
                  : "Add an active paid plan to calculate the credit conversion."}
            </p>
            {modelBreakdowns.length > 0 ? (
              <div className="mt-3 space-y-3">
                {modelBreakdowns.map((model) => (
                  <div
                    className="rounded-lg border bg-background p-3 text-xs sm:text-sm"
                    key={model.id}
                  >
                    <div className="flex flex-wrap items-center gap-2 font-semibold text-foreground text-xs">
                      <span>{model.name}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
                        {model.providerLabel}
                      </span>
                      {model.isDefault && (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-[10px] text-emerald-700 dark:text-emerald-400">
                          Default model
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      Provider cost / 1M tokens (in / out):
                      <span className="ml-1 font-semibold text-foreground">
                        {currencyFormatter(
                          model.economics.providerInputPerMillionInr,
                          "INR"
                        )}{" "}
                        /{" "}
                        {currencyFormatter(
                          model.economics.providerOutputPerMillionInr,
                          "INR"
                        )}
                      </span>
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Customer pays / 1M tokens (in / out):
                      <span className="ml-1 font-semibold text-foreground">
                        {currencyFormatter(
                          model.economics.customerInputPerMillionInr,
                          "INR"
                        )}{" "}
                        /{" "}
                        {currencyFormatter(
                          model.economics.customerOutputPerMillionInr,
                          "INR"
                        )}
                      </span>
                    </p>
                    <p className="mt-1">
                      Margin:
                      <span
                        className={cn(
                          "ml-1 font-semibold",
                          model.economics.marginPercent >= 0
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-destructive"
                        )}
                      >
                        {model.economics.marginPercent.toFixed(2)}%
                      </span>
                      <span className="ml-2 text-muted-foreground text-xs">
                        ({model.economics.realizedMarkup.toFixed(2)}x realized
                        of {model.markupMultiplier.toFixed(2)}x markup)
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-muted-foreground">
                Add provider costs for at least one active model to see
                per-model margin estimates.
              </p>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">
            Enter a price and credit units to preview the price per credit and
            margin for this plan.
          </p>
        )}
      </div>
    </>
  );
}
