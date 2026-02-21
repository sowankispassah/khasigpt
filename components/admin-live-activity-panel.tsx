"use client";

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { memo, useMemo } from "react";
import useSWR from "swr";

import { AdminDataPanel } from "@/components/admin-data-panel";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/utils";

type PresenceSummary = {
  activeNow: number;
  active15m: number;
  active60m: number;
  updatedAt: string;
};

type ActivityResponse = {
  summary: PresenceSummary;
  details?: unknown;
};

const SUMMARY_REFRESH_MS = 30_000;

const ActivityMetric = memo(function ActivityMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/70 p-4">
      <p className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-2 font-semibold text-2xl tabular-nums">
        {Number.isFinite(value) ? value : 0}
      </p>
      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  );
});

export function AdminLiveActivityPanel() {
  const { data, error } = useSWR<ActivityResponse>(
    "/api/admin/activity",
    fetcher,
    {
      refreshInterval: SUMMARY_REFRESH_MS,
      keepPreviousData: true,
    }
  );

  const summary = data?.summary;
  const updatedLabel = useMemo(() => {
    if (!summary?.updatedAt) {
      return "Updated just now";
    }
    try {
      return `Updated ${formatDistanceToNow(new Date(summary.updatedAt), {
        addSuffix: true,
      })}`;
    } catch {
      return "Updated just now";
    }
  }, [summary?.updatedAt]);

  const stats = useMemo(
    () => [
      {
        label: "Live now",
        value: summary?.activeNow ?? 0,
        hint: "Last 5 minutes",
      },
      {
        label: "Active",
        value: summary?.active15m ?? 0,
        hint: "Last 15 minutes",
      },
      {
        label: "Active",
        value: summary?.active60m ?? 0,
        hint: "Last 60 minutes",
      },
    ],
    [summary?.active15m, summary?.active60m, summary?.activeNow]
  );

  return (
    <AdminDataPanel
      title="Live user activity"
      action={
        <Button
          className="cursor-pointer"
          size="sm"
          type="button"
          variant="outline"
          asChild
        >
          <Link href="/admin/live-users">View live users</Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <ActivityMetric
              hint={stat.hint}
              key={`${stat.label}-${stat.hint}`}
              label={stat.label}
              value={stat.value}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Active users are counted via heartbeat pings.</span>
          <span>{updatedLabel}</span>
        </div>

        {error ? (
          <p className="text-destructive text-xs">
            Unable to load live activity right now.
          </p>
        ) : null}
      </div>
    </AdminDataPanel>
  );
}
