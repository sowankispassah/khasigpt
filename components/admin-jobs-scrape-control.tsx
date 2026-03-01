"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const ENDPOINT = "/api/admin/jobs/scrape";

type JobsScrapeProgressSnapshot = {
  runId: string;
  trigger: "manual" | "auto";
  state: "idle" | "running" | "success" | "failed" | "cancelled" | "skipped";
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  totalSources: number;
  processedSources: number;
  currentSource: string | null;
  lastCompletedSource: string | null;
  lookbackDays: number;
  cancelRequested: boolean;
  inserted: number | null;
  updated: number | null;
  skippedDuplicates: number | null;
  message: string | null;
};

type StatusResponse = {
  ok?: boolean;
  progress?: JobsScrapeProgressSnapshot | null;
};

function formatTime(value: string | null) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString("en-IN", { hour12: true });
}

export function AdminJobsScrapeControl() {
  const [progress, setProgress] = useState<JobsScrapeProgressSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch(ENDPOINT, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as StatusResponse;
      setProgress(payload.progress ?? null);
    } catch {
      // ignore transient polling failures
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const intervalMs = progress?.state === "running" ? 2_000 : 8_000;
    const id = window.setInterval(() => {
      void refreshStatus();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [progress?.state, refreshStatus]);

  const runStart = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            accepted?: boolean;
            alreadyRunning?: boolean;
            progress?: JobsScrapeProgressSnapshot | null;
          }
        | null;
      if (!response.ok) {
        setMessage("Failed to start scrape.");
        return;
      }
      if (payload?.progress) {
        setProgress(payload.progress);
      }
      if (payload?.alreadyRunning) {
        setMessage("A scrape is already running.");
      } else if (payload?.accepted) {
        setMessage("Scrape started in background.");
      }
      await refreshStatus();
    } catch {
      setMessage("Failed to start scrape.");
    } finally {
      setLoading(false);
    }
  }, [refreshStatus]);

  const requestCancel = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { progress?: JobsScrapeProgressSnapshot | null }
        | null;
      if (!response.ok) {
        setMessage("Failed to request cancel.");
        return;
      }
      setProgress(payload?.progress ?? null);
      setMessage("Cancel requested. It will stop after current source finishes.");
      await refreshStatus();
    } catch {
      setMessage("Failed to request cancel.");
    } finally {
      setLoading(false);
    }
  }, [refreshStatus]);

  const progressValue = useMemo(() => {
    if (!progress) {
      return 0;
    }
    if (progress.totalSources <= 0) {
      return progress.state === "running" ? 8 : 0;
    }
    const value = Math.round((progress.processedSources / progress.totalSources) * 100);
    return Math.max(0, Math.min(100, value));
  }, [progress]);

  const running = progress?.state === "running";
  const finishedAtLabel = formatTime(progress?.finishedAt ?? null);

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <Button
          className="cursor-pointer"
          disabled={loading || running}
          onClick={() => {
            void runStart();
          }}
          type="button"
        >
          {running ? "Scraping in progress..." : "Run Scrape Now"}
        </Button>
        <div className="min-w-0 flex-1">
          <Progress className="h-2" value={running ? progressValue : progressValue || 0} />
        </div>
        <Button
          className="cursor-pointer"
          disabled={loading || !running || Boolean(progress?.cancelRequested)}
          onClick={() => {
            void requestCancel();
          }}
          type="button"
          variant="destructive"
        >
          {progress?.cancelRequested ? "Cancel requested" : "Cancel Scrape"}
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">
        {running
          ? `Progress: ${progress?.processedSources ?? 0}/${progress?.totalSources ?? 0} sources. ${
              progress?.currentSource ? `Current: ${progress.currentSource}. ` : ""
            }${progress?.message ?? ""}`
          : progress
            ? `Last run state: ${progress.state}${
                finishedAtLabel ? ` at ${finishedAtLabel}` : ""
              }${progress.message ? ` (${progress.message})` : ""}`
            : "No active scrape run."}
      </p>
      {message ? <p className="text-xs">{message}</p> : null}
    </div>
  );
}
