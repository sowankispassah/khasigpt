"use client";

import { useEffect, useState } from "react";
import { DailyUsageChart } from "@/components/daily-usage-chart";
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
