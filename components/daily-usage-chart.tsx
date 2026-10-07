"use client";

import { useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "@/components/language-provider";

type DailyUsageDatum = {
  date: string;
  credits: number;
};

type DailyUsageChartProps = {
  data: DailyUsageDatum[];
  timezone?: string;
  variant?: "area" | "bar" | "line";
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
// Single series: the validated teal used across the app's charts, which keeps
// contrast on both the light and dark card surfaces.
const SERIES_COLOR = "#2a9d90";
const creditsFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const axisFormatter = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 1,
  notation: "compact",
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
  const { translate } = useTranslation();
  const unitLabel = translate("subscriptions.unit.credits", "credits");
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

  const ChartComponent =
    variant === "bar" ? BarChart : variant === "line" ? LineChart : AreaChart;
  const activeDot = {
    fill: SERIES_COLOR,
    r: 5,
    stroke: "var(--card)",
    strokeWidth: 2,
  };

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer height="100%" width="100%">
        <ChartComponent
          data={preparedData}
          margin={{ top: 8, bottom: 0, left: 0, right: 8 }}
        >
          <defs>
            <linearGradient
              id={`usage-gradient-${gradientId}`}
              x1="0"
              x2="0"
              y1="0"
              y2="1"
            >
              <stop offset="0%" stopColor={SERIES_COLOR} stopOpacity={0.22} />
              <stop offset="100%" stopColor={SERIES_COLOR} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeWidth={1} vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="formattedDate"
            interval="preserveStartEnd"
            minTickGap={24}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
            tickMargin={8}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            domain={yDomain}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickFormatter={(value: number) => axisFormatter.format(value)}
            tickLine={false}
            width={40}
          />
          <Tooltip<number, string>
            content={(props) => <DailyUsageTooltip {...props} unitLabel={unitLabel} />}
            cursor={
              variant === "bar"
                ? { fill: "var(--muted)", opacity: 0.6 }
                : { stroke: "var(--muted-foreground)", strokeWidth: 1 }
            }
          />
          {variant === "bar" ? (
            <Bar
              dataKey="credits"
              fill={SERIES_COLOR}
              maxBarSize={24}
              radius={[4, 4, 0, 0]}
            />
          ) : variant === "line" ? (
            <Line
              activeDot={activeDot}
              dataKey="credits"
              dot={false}
              stroke={SERIES_COLOR}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              type="monotone"
            />
          ) : (
            <Area
              activeDot={activeDot}
              dataKey="credits"
              fill={`url(#usage-gradient-${gradientId})`}
              fillOpacity={1}
              stroke={SERIES_COLOR}
              strokeWidth={2}
              type="monotone"
            />
          )}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}

function DailyUsageTooltip({
  active,
  payload,
  unitLabel,
}: TooltipProps<number, string> & {
  payload?: readonly ChartTooltipPayload[];
  unitLabel: string;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const datum = payload[0] as ChartTooltipPayload;

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-popover-foreground text-sm shadow-md">
      <p className="text-muted-foreground text-xs">{datum.payload.tooltipDate}</p>
      <p className="mt-0.5 font-semibold tabular-nums">
        {datum.payload.formattedCredits}{" "}
        <span className="font-normal text-muted-foreground text-xs">{unitLabel}</span>
      </p>
    </div>
  );
}
