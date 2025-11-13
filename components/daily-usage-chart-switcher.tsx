"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DailyUsageChart } from "@/components/daily-usage-chart";

type ChartVariant = "area" | "bar";

type DailyUsageChartSwitcherProps = {
  data: Array<{ date: string; credits: number }>;
  timezone?: string;
  defaultVariant?: ChartVariant;
};

const chartOptions: Array<{ value: ChartVariant; label: string }> = [
  { value: "area", label: "Area" },
  { value: "bar", label: "Bar" },
];

export function DailyUsageChartSwitcher({
  data,
  timezone,
  defaultVariant = "area",
}: DailyUsageChartSwitcherProps) {
  const [variant, setVariant] = useState<ChartVariant>(defaultVariant);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-2">
        {chartOptions.map((option) => (
          <Button
            key={option.value}
            size="sm"
            type="button"
            variant={variant === option.value ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setVariant(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <DailyUsageChart data={data} timezone={timezone} variant={variant} />
    </div>
  );
}
