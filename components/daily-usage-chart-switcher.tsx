"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type ChartVariant = "area" | "bar" | "line";

type DailyUsageChartSwitcherProps = {
  data: Array<{ date: string; credits: number }>;
  timezone?: string;
  defaultVariant?: ChartVariant;
};

const chartOptions: Array<{ value: ChartVariant; label: string }> = [
  { value: "area", label: "Area" },
  { value: "bar", label: "Bar" },
  { value: "line", label: "Line" },
];

const STORAGE_KEY = "subscriptions.dailyUsage.chartVariant";

const ChartSkeleton = () => (
  <div className="h-64 w-full animate-pulse rounded-xl border bg-muted/40" />
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
      <div className="flex items-center justify-end gap-2">
        {chartOptions.map((option) => (
          <Button
            className="cursor-pointer"
            key={option.value}
            onClick={() => handleVariantChange(option.value)}
            size="sm"
            type="button"
            variant={variant === option.value ? "default" : "outline"}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <DailyUsageChart data={data} timezone={timezone} variant={variant} />
    </div>
  );
}
