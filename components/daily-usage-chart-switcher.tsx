"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { cn } from "@/lib/utils";

type ChartVariant = "area" | "bar" | "line";

type DailyUsageChartSwitcherProps = {
  data: Array<{ date: string; credits: number }>;
  timezone?: string;
  defaultVariant?: ChartVariant;
};

const chartOptions: Array<{
  value: ChartVariant;
  label: string;
  translationKey: string;
}> = [
  {
    value: "area",
    label: "Area",
    translationKey: "subscriptions.daily_usage.chart.area",
  },
  {
    value: "bar",
    label: "Bar",
    translationKey: "subscriptions.daily_usage.chart.bar",
  },
  {
    value: "line",
    label: "Line",
    translationKey: "subscriptions.daily_usage.chart.line",
  },
];

const STORAGE_KEY = "subscriptions.dailyUsage.chartVariant";

const ChartSkeleton = () => (
  <div className="h-64 w-full animate-pulse rounded-xl bg-muted/40" />
);

const DailyUsageChart = dynamic(
  () =>
    import("@/components/daily-usage-chart").then(
      (mod) => mod.DailyUsageChart
    ),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  }
);

export function DailyUsageChartSwitcher({
  data,
  timezone,
  defaultVariant = "area",
}: DailyUsageChartSwitcherProps) {
  const [variant, setVariant] = useState<ChartVariant>(defaultVariant);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem(
      STORAGE_KEY
    ) as ChartVariant | null;
    if (stored && chartOptions.some((option) => option.value === stored)) {
      setVariant(stored);
    }
  }, []);

  const handleVariantChange = (next: ChartVariant) => {
    setVariant(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
          {chartOptions.map((option) => (
            <button
              aria-pressed={variant === option.value}
              className={cn(
                "min-h-9 cursor-pointer rounded-md px-3 font-medium text-xs transition",
                variant === option.value
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
              key={option.value}
              onClick={() => handleVariantChange(option.value)}
              type="button"
            >
              <EditableTranslation
                defaultText={option.label}
                translationKey={option.translationKey}
              />
            </button>
          ))}
        </div>
      </div>

      <DailyUsageChart data={data} timezone={timezone} variant={variant} />
    </div>
  );
}
