"use client";

import { useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";

type DailyUsageDatum = {
  date: string;
  credits: number;
};

type DailyUsageChartProps = {
  data: DailyUsageDatum[];
  timezone?: string;
};

type TooltipPayload = {
  value: number;
  payload: {
    formattedDate: string;
    formattedCredits: string;
  };
};

const DEFAULT_TIMEZONE = "Asia/Kolkata";
const creditsFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function buildFormatters(timezone: string) {
  const dateFormatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
  });
  const fullFormatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return { dateFormatter, fullFormatter };
}

export function DailyUsageChart({
  data,
  timezone = DEFAULT_TIMEZONE,
}: DailyUsageChartProps) {
  const gradientId = useId().replace(/:/g, "-");
  const { dateFormatter, fullFormatter } = useMemo(
    () => buildFormatters(timezone),
    [timezone]
  );

  const preparedData = useMemo(
    () =>
      data.map((datum) => {
        const date = new Date(datum.date);
        return {
          ...datum,
          formattedDate: dateFormatter.format(date),
          tooltipDate: fullFormatter.format(date),
          formattedCredits: creditsFormatter.format(datum.credits),
        };
      }),
    [data, dateFormatter, fullFormatter]
  );

  const maxCredits = preparedData.reduce(
    (max, datum) => Math.max(max, datum.credits),
    0
  );
  const yDomain: [number, number] = [
    0,
    maxCredits === 0 ? 1 : Math.ceil(maxCredits * 1.1),
  ];

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={preparedData}
          margin={{ top: 10, bottom: 0, left: 8, right: 24 }}
        >
          <defs>
            <linearGradient id={`usage-gradient-${gradientId}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--chart-1, var(--primary)))" stopOpacity={0.4} />
              <stop offset="95%" stopColor="hsl(var(--chart-1, var(--primary)))" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="4 4" vertical={false} opacity={0.35} />
          <XAxis
            dataKey="formattedDate"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            padding={{ left: 8, right: 16 }}
          />
          <YAxis
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={40}
            domain={yDomain}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: "hsl(var(--chart-1, var(--primary)))", strokeOpacity: 0.35 }}
            content={(props) => <DailyUsageTooltip {...props} />}
          />
          <Area
            type="monotone"
            dataKey="credits"
            stroke="hsl(var(--chart-1, var(--primary)))"
            fillOpacity={1}
            fill={`url(#usage-gradient-${gradientId})`}
            strokeWidth={2.5}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function DailyUsageTooltip({
  active,
  payload,
}: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const datum = payload[0] as TooltipPayload;

  return (
    <div className="rounded-md border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="font-medium">{datum.payload.tooltipDate}</p>
      <p className="text-muted-foreground text-xs">
        {datum.payload.formattedCredits} credits
      </p>
    </div>
  );
}
