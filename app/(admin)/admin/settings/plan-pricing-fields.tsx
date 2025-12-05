"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { TOKENS_PER_CREDIT } from "@/lib/constants";

const currencyFormatter = (
  value: number,
  currency: "INR" | "USD"
): string => {
  return value.toLocaleString(currency === "USD" ? "en-US" : "en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

type ModelCostPreview = {
  id: string;
  name: string;
  providerLabel: string;
  providerCostPerMillionInr: number;
  providerCostPerMillionUsd: number;
  isMarginBaseline: boolean;
};

type PlanPricingFieldsProps = {
  modelCosts: ModelCostPreview[];
  usdToInr: number;
  initialPriceInRupees?: number;
  initialTokenAllowance?: number;
};

export function PlanPricingFields({
  modelCosts,
  usdToInr,
  initialPriceInRupees,
  initialTokenAllowance,
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
    const tokens = Number(tokenAllowance);

    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(tokens) || tokens <= 0) {
      return null;
    }

    const perMillionInr = (price / tokens) * 1_000_000;
    const perMillionUsd = usdToInr > 0 ? perMillionInr / usdToInr : 0;
    return { perMillionInr, perMillionUsd };
  }, [
    priceInRupees,
    tokenAllowance,
    usdToInr,
  ]);

  const providerBreakdowns = useMemo(() => {
    if (!preview) {
      return [];
    }

    return modelCosts.map((model) => {
      const profitInr = preview.perMillionInr - model.providerCostPerMillionInr;
      const profitUsd = preview.perMillionUsd - model.providerCostPerMillionUsd;
      const marginPercent =
        preview.perMillionInr > 0 ? (profitInr / preview.perMillionInr) * 100 : 0;

      return {
        ...model,
        profitInr,
        profitUsd,
        marginPercent,
      };
    });
  }, [preview, modelCosts]);

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
          <label className="text-sm font-medium" htmlFor="plan-price">
            Price (INR)
          </label>
          <input
            className="rounded-md border bg-background px-3 py-2 text-sm"
            id="plan-price"
            min="0"
            name="priceInRupees"
            placeholder="299"
            required
            step="0.01"
            type="number"
            value={priceInRupees}
            onChange={handlePriceChange}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="plan-tokens">
            Token allowance
          </label>
          <input
            className="rounded-md border bg-background px-3 py-2 text-sm"
            id="plan-tokens"
            min={0}
            name="tokenAllowance"
            placeholder="100000"
            required
            type="number"
            value={tokenAllowance}
            onChange={handleAllowanceChange}
          />
          <p className="text-muted-foreground text-xs">
            {Number.isFinite(Number(tokenAllowance)) && Number(tokenAllowance) > 0
              ? `~ ${(Number(tokenAllowance) / TOKENS_PER_CREDIT).toLocaleString("en-IN")} credits (${TOKENS_PER_CREDIT} tokens = 1 credit)`
              : `Credits auto-calculate at ${TOKENS_PER_CREDIT} tokens per credit.`}
          </p>
        </div>
      </div>
      <div className="rounded-md border border-dashed border-muted-foreground/50 bg-muted/20 p-4 text-xs leading-relaxed sm:text-sm">
        {preview ? (
          <>
            <p className="font-medium text-foreground">
              Effective price / 1M tokens:
              <span className="ml-1 font-semibold">
                {currencyFormatter(preview.perMillionInr, "INR")}
              </span>
              <span className="ml-1 text-muted-foreground">
                ({currencyFormatter(preview.perMillionUsd, "USD")})
              </span>
            </p>
            {providerBreakdowns.length > 0 ? (
              <div className="mt-3 space-y-3">
                {providerBreakdowns.map((model) => (
                  <div
                    key={model.id}
                    className="rounded-md border border-muted-foreground/30 bg-background/80 p-3 text-xs sm:text-sm"
                  >
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-foreground">
          <span>{model.name}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {model.providerLabel}
          </span>
          {model.isMarginBaseline && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
              Margin baseline
            </span>
          )}
        </div>
                    <p className="mt-1 text-muted-foreground">
                      Provider cost / 1M tokens:
                      <span className="ml-1 font-semibold text-foreground">
                        {currencyFormatter(model.providerCostPerMillionInr, "INR")}
                      </span>
                      <span className="ml-1">
                        ({currencyFormatter(model.providerCostPerMillionUsd, "USD")})
                      </span>
                    </p>
                    <p className="mt-1">
                      Margin:
                      <span
                        className={cn(
                          "ml-1 font-semibold",
                          model.profitInr >= 0 ? "text-emerald-600" : "text-destructive"
                        )}
                      >
                        {currencyFormatter(model.profitInr, "INR")}
                      </span>
                      <span className="ml-1 text-muted-foreground">
                        ({currencyFormatter(model.profitUsd, "USD")})
                      </span>
                      <span className="ml-2 text-xs font-medium text-muted-foreground">
                        {model.marginPercent.toFixed(2)}%
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-muted-foreground">
                Add provider costs for at least one active model to see per-model margin estimates.
              </p>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">
            Enter a price and token allowance to preview the effective price and
            margin for this plan.
          </p>
        )}
      </div>
    </>
  );
}
