"use client";

import dynamic from "next/dynamic";
import type { AdminTrendPoint } from "@/lib/admin/dashboard-trends";

// recharts is only needed for this panel, so keep it out of the dashboard's
// first-load bundle and render it after hydration.
const AdminTrendChart = dynamic(
  () => import("@/components/admin/admin-trend-chart").then((module) => module.AdminTrendChart),
  {
    loading: () => <AdminTrendChartSkeleton />,
    ssr: false,
  }
);

export function AdminTrendChartSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4 p-5">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-7 w-20 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-8 w-56 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="h-56 animate-pulse rounded-lg bg-muted/60" />
    </div>
  );
}

export function AdminTrendChartDeferred({ points }: { points: AdminTrendPoint[] }) {
  return <AdminTrendChart points={points} />;
}
