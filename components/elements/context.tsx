"use client";

import type { ComponentProps } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import type { AppUsage } from "@/lib/usage";
import { cn } from "@/lib/utils";

export type ContextProps = ComponentProps<"button"> & {
  /** Optional full usage payload to enable breakdown view */
  usage?: AppUsage;
};

const _THOUSAND = 1000;
const _MILLION = 1_000_000;
const _BILLION = 1_000_000_000;
const PERCENT_MAX = 100;

// Lucide CircleIcon geometry
const ICON_VIEWBOX = 24;
const ICON_CENTER = 12;
const ICON_RADIUS = 10;
const ICON_STROKE_WIDTH = 2;

type ContextIconProps = {
  percent: number; // 0 - 100
};

export const ContextIcon = ({ percent }: ContextIconProps) => {
  const radius = ICON_RADIUS;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - percent / PERCENT_MAX);

  return (
    <svg
      aria-label={`${percent.toFixed(2)}% of model context used`}
      height="28"
      role="img"
      style={{ color: "currentcolor" }}
      viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
      width="28"
    >
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity="0.25"
        r={radius}
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
      />
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity="0.7"
        r={radius}
        stroke="currentColor"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        strokeWidth={ICON_STROKE_WIDTH}
        transform={`rotate(-90 ${ICON_CENTER} ${ICON_CENTER})`}
      />
    </svg>
  );
};

function InfoRow({
  label,
  tokens,
  costUSD,
  costINR,
}: {
  label: string;
  tokens?: number;
  costUSD?: number;
  costINR?: number;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 font-mono">
        <span className="min-w-[4ch] text-right">
          {tokens === undefined ? "—" : tokens.toLocaleString()}
        </span>
        {typeof costUSD === "number" && Number.isFinite(costUSD) && (
          <span className="text-muted-foreground">${costUSD.toFixed(6)}</span>
        )}
        {typeof costINR === "number" && Number.isFinite(costINR) && (
          <span className="text-muted-foreground">₹{costINR.toFixed(4)}</span>
        )}
      </div>
    </div>
  );
}

export const Context = ({ className, usage, ...props }: ContextProps) => {
  const used = usage?.totalTokens ?? 0;
  const max =
    usage?.context?.totalMax ??
    usage?.context?.combinedMax ??
    usage?.context?.inputMax;
  const hasMax = typeof max === "number" && Number.isFinite(max) && max > 0;
  const usedPercent = hasMax ? Math.min(100, (used / max) * 100) : 0;
  const conversionRate = usage?.conversionRateINR;
  const totalUSD = usage?.costUSD?.totalUSD;
  const totalINR = usage?.costINR?.totalINR;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "inline-flex select-none items-center gap-1 rounded-md text-sm",
            "cursor-pointer bg-background text-foreground",
            className
          )}
          type="button"
          {...props}
        >
          <span className="hidden font-medium text-muted-foreground">
            {usedPercent.toFixed(1)}%
          </span>
          <ContextIcon percent={usedPercent} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-fit p-3" side="top">
        <div className="min-w-[240px] space-y-2">
          <div className="flex items-start justify-between text-sm">
            <span>{usedPercent.toFixed(1)}%</span>
            <span className="text-muted-foreground">
              {hasMax ? `${used} / ${max} tokens` : `${used} tokens`}
            </span>
          </div>
          <div className="space-y-2">
            <Progress className="h-2 bg-muted" value={usedPercent} />
          </div>
          <div className="mt-1 space-y-1">
            {usage?.cachedInputTokens && usage.cachedInputTokens > 0 && (
              <InfoRow
                costINR={usage?.costINR?.cacheReadINR ?? undefined}
                costUSD={usage?.costUSD?.cacheReadUSD ?? undefined}
                label="Cache Hits"
                tokens={usage?.cachedInputTokens}
              />
            )}
            <InfoRow
              costINR={usage?.costINR?.inputINR ?? undefined}
              costUSD={usage?.costUSD?.inputUSD ?? undefined}
              label="Input"
              tokens={usage?.inputTokens}
            />
            <InfoRow
              costINR={usage?.costINR?.outputINR ?? undefined}
              costUSD={usage?.costUSD?.outputUSD ?? undefined}
              label="Output"
              tokens={usage?.outputTokens}
            />
            <InfoRow
              costINR={usage?.costINR?.reasoningINR ?? undefined}
              costUSD={usage?.costUSD?.reasoningUSD ?? undefined}
              label="Reasoning"
              tokens={
                usage?.reasoningTokens && usage.reasoningTokens > 0
                  ? usage.reasoningTokens
                  : undefined
              }
            />
            {typeof totalUSD === "number" && Number.isFinite(totalUSD) && (
              <>
                <Separator className="mt-1" />
                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-muted-foreground">Total cost</span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="min-w-[4ch] text-right" />
                    <span>${totalUSD.toFixed(6)}</span>
                    {typeof totalINR === "number" &&
                      Number.isFinite(totalINR) && (
                        <span>₹{totalINR.toFixed(4)}</span>
                      )}
                    {typeof conversionRate === "number" &&
                      Number.isFinite(conversionRate) && (
                        <span className="text-[10px] text-muted-foreground">
                          {`(1 USD ≈ ₹${conversionRate.toFixed(2)})`}
                        </span>
                      )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
