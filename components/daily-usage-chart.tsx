"use client";

import { useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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
  variant?: "area" | "bar";
};

type ChartTooltipPayload = {
  value: number;
  payload: {
    formattedDate: string;
    formattedCredits: string;
    tooltipDate: string;
  };
};

const DEFAULT_TIMEZONE = "Asia/Kolkata";
const DARK_GREEN = "hsl(155 36% 30%)";
const DARK_GREEN_LIGHT = "hsl(155 36% 45%)";
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
  variant = "area",
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

  const ChartComponent = variant === "bar" ? BarChart : AreaChart;

  return (
    <div className="w-full" style={{ minHeight: 240 }}>
      <div className="h-64 w-full overflow-x-auto">
        <div className="h-full min-w-[560px]">
          <ResponsiveContainer width="100%" height="100%">
            <ChartComponent
              data={preparedData}
              margin={{ top: 10, bottom: 0, left: 8, right: 24 }}
            >
              <defs>
                <linearGradient id={`usage-gradient-${gradientId}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="5%" stopColor={DARK_GREEN_LIGHT} stopOpacity={0.55} />
                  <stop offset="95%" stopColor={DARK_GREEN} stopOpacity={0.12} />
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
              <Tooltip<number, string>
                cursor={{ stroke: DARK_GREEN, strokeOpacity: 0.35 }}
                content={(props) => <DailyUsageTooltip {...props} />}
              />
              {variant === "bar" ? (
                <Bar
                  dataKey="credits"
                  fill={DARK_GREEN}
                  radius={[6, 6, 0, 0]}
                />
              ) : (
                <Area
                  type="monotone"
                  dataKey="credits"
                  stroke={DARK_GREEN}
                  fillOpacity={1}
                  fill={`url(#usage-gradient-${gradientId})`}
                  strokeWidth={2.5}
                  activeDot={{ r: 5 }}
                />
              )}
            </ChartComponent>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function DailyUsageTooltip({
  active,
  payload,
}: TooltipProps<number, string> & {
  payload?: ReadonlyArray<ChartTooltipPayload>;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const datum = payload[0] as ChartTooltipPayload;

  return (
    <div className="rounded-md border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="font-medium">{datum.payload.tooltipDate}</p>
      <p className="text-muted-foreground text-xs">
        {datum.payload.formattedCredits} credits
      </p>
    </div>
  );
}
