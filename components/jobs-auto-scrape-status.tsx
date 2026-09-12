"use client";

import { useEffect, useState } from "react";
import { JOBS_AUTO_TRIGGER_RESPONSE_EVENT } from "@/components/jobs-auto-scrape-trigger";

const AUTO_TRIGGER_LAST_RESPONSE_KEY = "jobs:auto-trigger:last-response";

type AutoTriggerResponseSnapshot = {
  recordedAt: string;
  httpStatus: number;
  ok: boolean;
  accepted: boolean;
  skipReason: string | null;
  message: string | null;
  error: string | null;
};

function readSnapshotFromStorage() {
  try {
    const raw = window.sessionStorage.getItem(AUTO_TRIGGER_LAST_RESPONSE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as AutoTriggerResponseSnapshot;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function formatSnapshot(snapshot: AutoTriggerResponseSnapshot) {
  const timeText = (() => {
    const parsed = new Date(snapshot.recordedAt);
    if (Number.isNaN(parsed.getTime())) {
      return "unknown time";
    }
    return parsed.toLocaleString("en-IN", {
      hour12: true,
    });
  })();

  if (snapshot.accepted && snapshot.skipReason === "running_or_slow") {
    return `Auto trigger (${timeText}): accepted, scrape still running/slow.`;
  }
  if (snapshot.ok) {
    return `Auto trigger (${timeText}): completed request successfully (HTTP ${snapshot.httpStatus}).`;
  }
  if (snapshot.error) {
    return `Auto trigger (${timeText}): failed (${snapshot.error}).`;
  }
  if (snapshot.message) {
    return `Auto trigger (${timeText}): ${snapshot.message}`;
  }

  return `Auto trigger (${timeText}): no additional details.`;
}

export function JobsAutoScrapeStatus() {
  const [snapshot, setSnapshot] = useState<AutoTriggerResponseSnapshot | null>(
    null
  );

  useEffect(() => {
    setSnapshot(readSnapshotFromStorage());

    const onResponse = (event: Event) => {
      const custom = event as CustomEvent<AutoTriggerResponseSnapshot>;
      setSnapshot(custom.detail ?? null);
    };

    window.addEventListener(JOBS_AUTO_TRIGGER_RESPONSE_EVENT, onResponse as EventListener);
    return () => {
      window.removeEventListener(
        JOBS_AUTO_TRIGGER_RESPONSE_EVENT,
        onResponse as EventListener
      );
    };
  }, []);

  return (
    <p className="text-muted-foreground text-xs">
      {snapshot
        ? formatSnapshot(snapshot)
        : "Auto trigger status in this tab will appear here after the next request."}
    </p>
  );
}
