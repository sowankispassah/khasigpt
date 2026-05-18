"use client";

import { useMemo, useState } from "react";
import { TOKENS_PER_CREDIT } from "@/lib/constants";

type LiveVoiceCreditMultiplierFieldProps = {
  initialMultiplier?: number;
  inputId: string;
};

export function LiveVoiceCreditMultiplierField({
  initialMultiplier = 3,
  inputId,
}: LiveVoiceCreditMultiplierFieldProps) {
  const [multiplier, setMultiplier] = useState(() =>
    Number.isFinite(initialMultiplier) && initialMultiplier > 0
      ? String(initialMultiplier)
      : "3"
  );

  const preview = useMemo(() => {
    const parsed = Number.parseFloat(multiplier);
    const safeMultiplier = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    const tokens = Math.max(0, Math.round(safeMultiplier * TOKENS_PER_CREDIT));
    return {
      credits: safeMultiplier,
      tokens,
    };
  }, [multiplier]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <label className="font-medium text-sm" htmlFor={inputId}>
          Credit multiplier
        </label>
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          id={inputId}
          min={0.01}
          name="creditMultiplier"
          onChange={(event) => setMultiplier(event.target.value)}
          step={0.01}
          type="number"
          value={multiplier}
        />
        <p className="text-muted-foreground text-xs">
          Presets like 1x, 1.5x, 2x, 2.5x, 3x, and 5x are supported. Custom
          numeric values work too.
        </p>
      </div>

      <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm">
        <p className="font-medium">Credit preview</p>
        <p className="mt-2 text-muted-foreground">
          1 voice input/output interaction is about{" "}
          <span className="font-semibold text-foreground">
            {preview.credits ? preview.credits.toLocaleString("en-IN") : "0"}{" "}
            normal chat credits
          </span>
          .
        </p>
        <p className="mt-1 text-muted-foreground text-xs">
          This deducts about {preview.tokens.toLocaleString("en-IN")} internal
          usage tokens from the shared credits balance.
        </p>
      </div>
    </div>
  );
}
