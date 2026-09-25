"use client";

import dynamic from "next/dynamic";

import { AdminDataPanel } from "@/components/admin-data-panel";

const AdminLiveActivityPanel = dynamic(
  () =>
    import("@/components/admin-live-activity-panel").then(
      (module) => module.AdminLiveActivityPanel
    ),
  {
    ssr: false,
    loading: () => (
      <AdminDataPanel title="Live user activity">
        <div aria-busy="true" aria-live="polite" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="h-24 animate-pulse rounded-lg border border-border/60 bg-background/70" />
            <div className="h-24 animate-pulse rounded-lg border border-border/60 bg-background/70" />
            <div className="h-24 animate-pulse rounded-lg border border-border/60 bg-background/70" />
          </div>
          <div className="h-4 w-48 animate-pulse rounded bg-muted/70" />
        </div>
      </AdminDataPanel>
    ),
  }
);

export function AdminLiveActivityPanelDeferred() {
  return <AdminLiveActivityPanel />;
}
