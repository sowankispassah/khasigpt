"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const ENDPOINT = "/api/admin/jobs/scrape";
const RUN_START_GRACE_MS = 8_000;
const STATUS_REQUEST_TIMEOUT_MS = 8_000;
const ACTION_REQUEST_TIMEOUT_MS = 15_000;

type JobsScrapeProgressSnapshot = {
  runId: string;
  trigger: "manual" | "auto" | "cron";
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
  failureDetails: Array<{
    scope: "rag_sync";
    id: string;
    title: string;
    reason: string;
  }>;
};

type StatusResponse = {
  ok?: boolean;
  progress?: JobsScrapeProgressSnapshot | null;
};

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

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
    failureDetails: [],
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

function formatElapsedMs(durationMs: number | null) {
  if (!(typeof durationMs === "number") || !Number.isFinite(durationMs) || durationMs < 0) {
    return null;
  }
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function AdminJobsScrapeControl({
  initialProgress = null,
}: {
  initialProgress?: JobsScrapeProgressSnapshot | null;
}) {
  const [progress, setProgress] = useState<JobsScrapeProgressSnapshot | null>(
    initialProgress
  );
  const [pendingAction, setPendingAction] = useState<"cancel" | "start" | null>(
    null
  );
  const [message, setMessage] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const optimisticRunGuardRef = useRef<{
    runId: string;
    untilMs: number;
  } | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetchWithTimeout(
        ENDPOINT,
        {
          method: "GET",
          cache: "no-store",
        },
        STATUS_REQUEST_TIMEOUT_MS
      );
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as StatusResponse;
      const next = payload.progress ?? null;
      setProgress((current) => {
        const guard = optimisticRunGuardRef.current;
        if (guard) {
          const guardActive = Date.now() < guard.untilMs;
          const currentIsGuardRun =
            current?.state === "running" && current.runId === guard.runId;
          const nextIsGuardRun = next?.state === "running" && next.runId === guard.runId;

          if (guardActive && currentIsGuardRun && !nextIsGuardRun && next?.state !== "running") {
            return current;
          }

          if (!guardActive || next?.runId === guard.runId || next?.state === "running") {
            optimisticRunGuardRef.current = null;
          }
        }

        return next;
      });
    } catch (error) {
      if (!isAbortError(error)) {
        console.warn("[admin/jobs] Failed to refresh scrape status.", error);
      }
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

  const running = progress?.state === "running";

  useEffect(() => {
    if (!running) {
      return;
    }
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);
    return () => window.clearInterval(id);
  }, [running]);

  const runStart = useCallback(async () => {
    const optimistic = createOptimisticRunningSnapshot();
    setProgress(optimistic);
    optimisticRunGuardRef.current = {
      runId: optimistic.runId,
      untilMs: Date.now() + RUN_START_GRACE_MS,
    };
    setPendingAction("start");
    setMessage(null);
    try {
      const response = await fetchWithTimeout(
        ENDPOINT,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "start" }),
        },
        ACTION_REQUEST_TIMEOUT_MS
      );
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
        optimisticRunGuardRef.current = null;
        return;
      }
      if (payload?.progress) {
        setProgress(payload.progress);
      }
      if (payload?.alreadyRunning) {
        setMessage("A scrape is already running.");
        optimisticRunGuardRef.current = null;
      } else if (payload?.accepted) {
        const acceptedRunId = payload.runId ?? optimistic.runId;
        optimisticRunGuardRef.current = {
          runId: acceptedRunId,
          untilMs: Date.now() + RUN_START_GRACE_MS,
        };
        setProgress(createOptimisticRunningSnapshot(acceptedRunId));
        setMessage("Scrape started in background.");
      }
      window.setTimeout(() => {
        void refreshStatus();
      }, 1200);
    } catch (error) {
      setMessage(
        isAbortError(error)
          ? "Starting scrape timed out. Please retry."
          : "Failed to start scrape."
      );
      setProgress((current) =>
        current?.runId === optimistic.runId
          ? {
              ...current,
              state: "failed",
              message: isAbortError(error)
                ? "Starting scrape timed out."
                : "Failed to start scrape.",
              finishedAt: new Date().toISOString(),
            }
          : current
      );
      optimisticRunGuardRef.current = null;
    } finally {
      setPendingAction(null);
    }
  }, [refreshStatus]);

  const requestCancel = useCallback(async () => {
    setPendingAction("cancel");
    setMessage(null);
    try {
      const response = await fetchWithTimeout(
        ENDPOINT,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "cancel" }),
        },
        ACTION_REQUEST_TIMEOUT_MS
      );
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
    } catch (error) {
      setMessage(
        isAbortError(error)
          ? "Cancel request timed out. Please retry."
          : "Failed to request cancel."
      );
    } finally {
      setPendingAction(null);
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

  const finishedAtLabel = formatTime(progress?.finishedAt ?? null);
  const elapsedLabel = useMemo(() => {
    if (!progress) {
      return null;
    }

    const startedAtMs = Date.parse(progress.startedAt);
    if (!Number.isFinite(startedAtMs)) {
      return null;
    }

    const endMs = running
      ? nowMs
      : progress.finishedAt
        ? Date.parse(progress.finishedAt)
        : nowMs;
    if (!Number.isFinite(endMs)) {
      return null;
    }

    return formatElapsedMs(Math.max(0, endMs - startedAtMs));
  }, [nowMs, progress, running]);
  const progressPercentLabel = `${progressValue}%`;
  const statusText = useMemo(() => {
    if (!progress) {
      return "No active scrape run.";
    }

    if (running) {
      const isFinalizing =
        progress.totalSources > 0 &&
        progress.processedSources >= progress.totalSources &&
        !progress.currentSource;
      const prefix = isFinalizing ? "Finalizing" : "Progress";
      return `${prefix}: ${progress.processedSources}/${progress.totalSources} sources (${progressPercentLabel}).${
        elapsedLabel ? ` Elapsed: ${elapsedLabel}.` : ""
      } ${progress.currentSource ? `Current: ${progress.currentSource}. ` : ""}${progress.message ?? ""}`.trim();
    }

    return `Last run state: ${progress.state}${
      finishedAtLabel ? ` at ${finishedAtLabel}` : ""
    }${elapsedLabel ? ` (${elapsedLabel})` : ""}${progress.message ? ` (${progress.message})` : ""}`;
  }, [elapsedLabel, finishedAtLabel, progress, progressPercentLabel, running]);
  const isStarting = pendingAction === "start";
  const isCancelling = pendingAction === "cancel";
  const hasPendingAction = pendingAction !== null;

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <Button
          className="cursor-pointer"
          disabled={hasPendingAction || running}
          onClick={() => {
            void runStart();
          }}
          type="button"
        >
          {isStarting ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin">
                <LoaderIcon size={16} />
              </span>
              <span>Starting...</span>
            </span>
          ) : running ? (
            "Scraping in progress..."
          ) : (
            "Run Scrape Now"
          )}
        </Button>
        {running ? (
          <>
            <div className="min-w-0 flex-1">
              <Progress className="h-2" value={running ? progressValue : progressValue || 0} />
            </div>
            <Button
              className="cursor-pointer"
              disabled={
                hasPendingAction || !running || Boolean(progress?.cancelRequested)
              }
              onClick={() => {
                void requestCancel();
              }}
              type="button"
              variant="destructive"
            >
              {isCancelling ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin">
                    <LoaderIcon size={16} />
                  </span>
                  <span>Requesting...</span>
                </span>
              ) : progress?.cancelRequested ? (
                "Cancel requested"
              ) : (
                "Cancel Scrape"
              )}
            </Button>
          </>
        ) : null}
      </div>

      <p className="text-muted-foreground text-xs">{statusText}</p>
      {progress?.failureDetails?.length ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          {progress.failureDetails.map((detail) => (
            <p key={`${detail.scope}:${detail.id}`} className="whitespace-normal">
              <strong>{detail.title}</strong>: {detail.reason}
            </p>
          ))}
        </div>
      ) : null}
      {message ? <p className="text-xs">{message}</p> : null}
    </div>
  );
}
