"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const ENDPOINT = "/api/admin/jobs/scrape";
const VISIBILITY_KEY = "admin:jobs:scrape-control:visible";

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

function createOptimisticRunningSnapshot(
  runId: string = `pending-${Date.now()}`
): JobsScrapeProgressSnapshot {
  const nowIso = new Date().toISOString();
  return {
    runId,
    trigger: "manual",
    state: "running",
    startedAt: nowIso,
    updatedAt: nowIso,
    finishedAt: null,
    totalSources: 0,
    processedSources: 0,
    currentSource: null,
    lastCompletedSource: null,
    lookbackDays: 0,
    cancelRequested: false,
    inserted: null,
    updated: null,
    skippedDuplicates: null,
    message: "Starting scrape...",
  };
}

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
  const [showStatusUi, setShowStatusUi] = useState(false);

  const setStatusUiVisible = useCallback((value: boolean) => {
    setShowStatusUi(value);
    try {
      if (value) {
        window.sessionStorage.setItem(VISIBILITY_KEY, "1");
      } else {
        window.sessionStorage.removeItem(VISIBILITY_KEY);
      }
    } catch {
      // ignore storage failures
    }
  }, []);

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
    try {
      setShowStatusUi(window.sessionStorage.getItem(VISIBILITY_KEY) === "1");
    } catch {
      setShowStatusUi(false);
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
    const optimistic = createOptimisticRunningSnapshot();
    setProgress(optimistic);
    setStatusUiVisible(true);
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
            runId?: string;
            progress?: JobsScrapeProgressSnapshot | null;
          }
        | null;
      if (!response.ok) {
        setMessage("Failed to start scrape.");
        setProgress((current) =>
          current?.runId === optimistic.runId
            ? {
                ...current,
                state: "failed",
                message: "Failed to start scrape.",
                finishedAt: new Date().toISOString(),
              }
            : current
        );
        return;
      }
      if (payload?.progress) {
        setProgress(payload.progress);
      }
      if (payload?.alreadyRunning) {
        setMessage("A scrape is already running.");
      } else if (payload?.accepted) {
        setProgress(
          createOptimisticRunningSnapshot(payload.runId ?? optimistic.runId)
        );
        setMessage("Scrape started in background.");
      }
      window.setTimeout(() => {
        void refreshStatus();
      }, 1200);
    } catch {
      setMessage("Failed to start scrape.");
      setProgress((current) =>
        current?.runId === optimistic.runId
          ? {
              ...current,
              state: "failed",
              message: "Failed to start scrape.",
              finishedAt: new Date().toISOString(),
            }
          : current
      );
    } finally {
      setLoading(false);
    }
  }, [refreshStatus, setStatusUiVisible]);

  const requestCancel = useCallback(async () => {
    setStatusUiVisible(true);
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
  }, [refreshStatus, setStatusUiVisible]);

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
        {showStatusUi ? (
          <>
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
          </>
        ) : null}
      </div>

      {showStatusUi ? (
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
      ) : null}
      {message ? <p className="text-xs">{message}</p> : null}
    </div>
  );
}
