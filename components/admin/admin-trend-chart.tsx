"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  type TooltipProps,
  XAxis,
  YAxis,
} from "recharts";
import { useTranslation } from "@/components/language-provider";
import type { AdminTrendPoint } from "@/lib/admin/dashboard-trends";
import { cn } from "@/lib/utils";

type Metric = "signups" | "chats" | "revenue";

// One series at a time, so a single hue validated against both the light and
// dark card surfaces (dataviz lightness band + 3:1 contrast).
const SERIES_COLOR = "#2a9d90";

const METRICS: { key: Metric; labelKey: string; label: string }[] = [
  { key: "signups", label: "Signups", labelKey: "admin.dashboard.trend.signups" },
  { key: "chats", label: "Chats", labelKey: "admin.dashboard.trend.chats" },
  { key: "revenue", label: "Revenue", labelKey: "admin.dashboard.trend.revenue" },
];

const dayFormatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" });
const integerFormatter = new Intl.NumberFormat("en-IN");
const rupeeFormatter = new Intl.NumberFormat("en-IN", {
  currency: "INR",
  maximumFractionDigits: 0,
  style: "currency",
});

function formatDay(date: string) {
  return dayFormatter.format(new Date(`${date}T00:00:00`));
}

function formatValue(metric: Metric, value: number) {
  return metric === "revenue" ? rupeeFormatter.format(value) : integerFormatter.format(value);
}

export function AdminTrendChart({ points }: { points: AdminTrendPoint[] }) {
  const { translate } = useTranslation();
  const [metric, setMetric] = useState<Metric>("signups");
  const total = useMemo(
    () => points.reduce((sum, point) => sum + point[metric], 0),
    [metric, points]
  );
  const metricLabel = translate(
    METRICS.find((entry) => entry.key === metric)?.labelKey ?? "",
    METRICS.find((entry) => entry.key === metric)?.label ?? ""
  );

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-sm">
            {translate("admin.dashboard.trend.total_30d", "{metric}, last 30 days").replace(
              "{metric}",
              metricLabel
            )}
          </p>
          <p className="font-semibold text-2xl tracking-tight">
            {formatValue(metric, total)}
          </p>
        </div>
        <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
          {METRICS.map((entry) => (
            <button
              aria-pressed={metric === entry.key}
              className={cn(
                "cursor-pointer rounded-md px-3 py-1 font-medium text-xs transition",
                metric === entry.key
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
              key={entry.key}
              onClick={() => setMetric(entry.key)}
              type="button"
            >
              {translate(entry.labelKey, entry.label)}
            </button>
          ))}
        </div>
      </div>

      <div aria-hidden="true" className="h-56 w-full">
        <ResponsiveContainer height="100%" width="100%">
          <AreaChart data={points} margin={{ bottom: 0, left: 0, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="admin-trend-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={SERIES_COLOR} stopOpacity={0.16} />
                <stop offset="100%" stopColor={SERIES_COLOR} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeWidth={1} vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="date"
              interval="preserveStartEnd"
              minTickGap={24}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickFormatter={formatDay}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickFormatter={(value: number) =>
                metric === "revenue" ? rupeeFormatter.format(value) : integerFormatter.format(value)
              }
              tickLine={false}
              width={metric === "revenue" ? 64 : 32}
            />
            <Tooltip
              content={<TrendTooltip metric={metric} metricLabel={metricLabel} />}
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
            />
            <Area
              activeDot={{ fill: SERIES_COLOR, r: 4, stroke: "var(--card)", strokeWidth: 2 }}
              dataKey={metric}
              fill="url(#admin-trend-fill)"
              isAnimationActive={false}
              stroke={SERIES_COLOR}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              type="monotone"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Table alternative for screen readers; the chart itself is decorative. */}
      <table className="sr-only">
        <caption>{metricLabel}</caption>
        <thead>
          <tr>
            <th scope="col">{translate("admin.dashboard.trend.date", "Date")}</th>
            <th scope="col">{metricLabel}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.date}>
              <td>{formatDay(point.date)}</td>
              <td>{formatValue(metric, point[metric])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrendTooltip({
  active,
  metric,
  metricLabel,
  payload,
}: TooltipProps<number, string> & {
  metric: Metric;
  metricLabel: string;
  payload?: readonly { payload: AdminTrendPoint }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) {
    return null;
  }
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-popover-foreground text-xs shadow-md">
      <p className="text-muted-foreground">{formatDay(point.date)}</p>
      <p className="mt-0.5 flex items-center gap-2 font-medium">
        <span
          aria-hidden="true"
          className="size-2 rounded-full"
          style={{ backgroundColor: SERIES_COLOR }}
        />
        {metricLabel}: {formatValue(metric, point[metric])}
      </p>
    </div>
  );
}
