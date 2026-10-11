import { cn } from "@/lib/utils";
import { formatPercent, type Money } from "./account-format";

// Single-series marks share the admin dashboard's validated teal, which holds
// contrast on both the light and dark card surfaces.
const SERIES_COLOR = "#2a9d90";
const MAX_DAILY_COLUMNS = 62;

export type CostShareItem = {
  key: string;
  label: string;
  detail: string;
  costUsd: number;
  estimated?: boolean;
};

/** Horizontal bars: one hue, value and share at each bar's end. */
export function CostShareBars({
  items,
  money,
}: {
  items: CostShareItem[];
  money: Money;
}) {
  const total = items.reduce((sum, item) => sum + item.costUsd, 0);
  const max = items.reduce((peak, item) => Math.max(peak, item.costUsd), 0);

  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => {
        const share = total > 0 ? (item.costUsd / total) * 100 : 0;
        const width = max > 0 ? Math.max((item.costUsd / max) * 100, 0.5) : 0;
        return (
          <li className="flex flex-col gap-1.5" key={item.key}>
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <span className="font-medium text-sm">{item.label}</span>
                {item.estimated ? (
                  <span className="ml-1.5 text-muted-foreground text-xs">
                    (estimated)
                  </span>
                ) : null}
              </div>
              <div className="shrink-0 text-right text-sm tabular-nums">
                <span className="font-medium">{money.usd(item.costUsd)}</span>
                <span className="ml-2 inline-block w-12 text-muted-foreground text-xs">
                  {formatPercent(share)}
                </span>
              </div>
            </div>
            <div className="h-2.5 w-full rounded-r-[4px] bg-muted/70">
              <div
                className="h-full rounded-r-[4px]"
                style={{ backgroundColor: SERIES_COLOR, width: `${width}%` }}
              />
            </div>
            <p className="text-muted-foreground text-xs">{item.detail}</p>
          </li>
        );
      })}
    </ul>
  );
}

export type DailyCostPoint = {
  date: string;
  totalCostUsd: number;
  chatCostUsd: number;
  liveVoiceCostUsd: number;
  imageCostUsd: number;
  webSearchCostUsd: number;
  embeddingCostUsd: number;
};

type ChartBucket = DailyCostPoint & { label: string };

const BREAKDOWN_KEYS = [
  ["chatCostUsd", "Chat"],
  ["liveVoiceCostUsd", "Live voice"],
  ["imageCostUsd", "Images"],
  ["webSearchCostUsd", "Web search"],
  ["embeddingCostUsd", "Embeddings"],
] as const;

const dayLabel = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function parseDay(date: string) {
  return new Date(`${date}T00:00:00Z`);
}

function toDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function emptyPoint(date: string): DailyCostPoint {
  return {
    chatCostUsd: 0,
    date,
    embeddingCostUsd: 0,
    imageCostUsd: 0,
    liveVoiceCostUsd: 0,
    totalCostUsd: 0,
    webSearchCostUsd: 0,
  };
}

function addPoint(target: DailyCostPoint, source: DailyCostPoint) {
  target.totalCostUsd += source.totalCostUsd;
  target.chatCostUsd += source.chatCostUsd;
  target.liveVoiceCostUsd += source.liveVoiceCostUsd;
  target.imageCostUsd += source.imageCostUsd;
  target.webSearchCostUsd += source.webSearchCostUsd;
  target.embeddingCostUsd += source.embeddingCostUsd;
}

/**
 * Fills the days between the first and last data point with zero so the
 * columns sit on an even time axis; long ranges roll up into weeks.
 */
export function buildCostBuckets(points: DailyCostPoint[]): {
  buckets: ChartBucket[];
  unit: "day" | "week";
} {
  if (points.length === 0) {
    return { buckets: [], unit: "day" };
  }
  const byDay = new Map(points.map((point) => [point.date, point]));
  const sorted = [...byDay.keys()].sort();
  const first = parseDay(sorted[0]);
  const last = parseDay(sorted.at(-1) ?? sorted[0]);
  const days: DailyCostPoint[] = [];
  for (
    let cursor = first;
    cursor <= last;
    cursor = new Date(cursor.getTime() + 86_400_000)
  ) {
    const key = toDayKey(cursor);
    days.push(byDay.get(key) ?? emptyPoint(key));
  }

  if (days.length <= MAX_DAILY_COLUMNS) {
    return {
      buckets: days.map((day) => ({
        ...day,
        label: dayLabel.format(parseDay(day.date)),
      })),
      unit: "day",
    };
  }

  const weeks = new Map<string, ChartBucket>();
  for (const day of days) {
    const date = parseDay(day.date);
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    const weekStart = toDayKey(new Date(date.getTime() - mondayOffset * 86_400_000));
    let bucket = weeks.get(weekStart);
    if (!bucket) {
      bucket = {
        ...emptyPoint(weekStart),
        label: `Week of ${dayLabel.format(parseDay(weekStart))}`,
      };
      weeks.set(weekStart, bucket);
    }
    addPoint(bucket, day);
  }
  return { buckets: [...weeks.values()], unit: "week" };
}

/** Single-series column chart with a per-column hover and focus tooltip. */
export function DailyCostChart({
  buckets,
  money,
}: {
  buckets: ChartBucket[];
  money: Money;
}) {
  const max = buckets.reduce((peak, bucket) => Math.max(peak, bucket.totalCostUsd), 0);
  const middle = Math.floor(buckets.length / 2);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3">
        <div className="flex h-48 w-16 shrink-0 flex-col justify-between text-right text-muted-foreground text-xs tabular-nums">
          <span>{money.usd(max)}</span>
          <span>{money.usd(max / 2)}</span>
          <span>{money.usd(0)}</span>
        </div>
        <div className="relative h-48 min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            <div className="border-border/70 border-t" />
            <div className="border-border/70 border-t" />
            <div className="border-border border-t" />
          </div>
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {buckets.map((bucket, index) => {
              const height = max > 0 ? (bucket.totalCostUsd / max) * 100 : 0;
              const align =
                index < buckets.length / 3
                  ? "left-0"
                  : index > (buckets.length * 2) / 3
                    ? "right-0"
                    : "left-1/2 -translate-x-1/2";
              const parts = BREAKDOWN_KEYS.filter(([key]) => bucket[key] > 0);
              return (
                <div
                  aria-label={`${bucket.label}: ${money.usd(bucket.totalCostUsd)}`}
                  className="group relative flex h-full min-w-0 flex-1 cursor-default items-end justify-center"
                  key={bucket.date}
                  role="img"
                >
                  <div
                    className="w-full max-w-6 rounded-t-[4px] transition-opacity group-hover:opacity-80"
                    style={{
                      backgroundColor: SERIES_COLOR,
                      height: `${height}%`,
                      minHeight: bucket.totalCostUsd > 0 ? 2 : 0,
                    }}
                  />
                  <div
                    className={cn(
                      "pointer-events-none absolute bottom-full z-10 mb-2 hidden w-48 rounded-lg border bg-popover p-2.5 text-popover-foreground text-xs shadow-md group-hover:block",
                      align
                    )}
                  >
                    <p className="font-medium">{bucket.label}</p>
                    <p className="mt-0.5 font-semibold text-sm tabular-nums">
                      {money.usd(bucket.totalCostUsd)}
                    </p>
                    {parts.length > 0 ? (
                      <dl className="mt-1.5 space-y-0.5">
                        {parts.map(([key, label]) => (
                          <div className="flex justify-between gap-2" key={key}>
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="tabular-nums">{money.usd(bucket[key])}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="mt-1 text-muted-foreground">No recorded cost</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="ml-[4.75rem] flex justify-between gap-2 text-muted-foreground text-xs">
        <span>{buckets[0]?.label}</span>
        {buckets.length > 2 ? <span>{buckets[middle]?.label}</span> : null}
        {buckets.length > 1 ? <span>{buckets.at(-1)?.label}</span> : null}
      </div>
    </div>
  );
}
