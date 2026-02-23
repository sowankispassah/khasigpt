"use client";

import { useEffect } from "react";

const AUTO_TRIGGER_ENDPOINT = "/api/jobs/auto-trigger";
const AUTO_TRIGGER_LAST_RUN_KEY = "jobs:auto-trigger:last-run-at";
const AUTO_TRIGGER_LAST_RESPONSE_KEY = "jobs:auto-trigger:last-response";
export const JOBS_AUTO_TRIGGER_RESPONSE_EVENT = "jobs:auto-trigger-response";
const AUTO_TRIGGER_MIN_INTERVAL_MS = 90_000;

function shouldRunAutoTriggerNow() {
  try {
    const raw = window.sessionStorage.getItem(AUTO_TRIGGER_LAST_RUN_KEY);
    const lastRunAt = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isFinite(lastRunAt)) {
      return true;
    }
    return Date.now() - lastRunAt >= AUTO_TRIGGER_MIN_INTERVAL_MS;
  } catch {
    return true;
  }
}

function markAutoTriggerRunNow() {
  try {
    window.sessionStorage.setItem(
      AUTO_TRIGGER_LAST_RUN_KEY,
      String(Date.now())
    );
  } catch {
    // Ignore storage failures and continue without throttling.
  }
}

type AutoTriggerResponseSnapshot = {
  recordedAt: string;
  httpStatus: number;
  ok: boolean;
  accepted: boolean;
  skipReason: string | null;
  message: string | null;
  error: string | null;
};

function persistAutoTriggerResponse(snapshot: AutoTriggerResponseSnapshot) {
  try {
    window.sessionStorage.setItem(
      AUTO_TRIGGER_LAST_RESPONSE_KEY,
      JSON.stringify(snapshot)
    );
  } catch {
    // Ignore storage failures and continue without persisted status.
  }

  window.dispatchEvent(
    new CustomEvent<AutoTriggerResponseSnapshot>(JOBS_AUTO_TRIGGER_RESPONSE_EVENT, {
      detail: snapshot,
    })
  );
}

export function JobsAutoScrapeTrigger() {
  useEffect(() => {
    if (!shouldRunAutoTriggerNow()) {
      return;
    }
    markAutoTriggerRunNow();

    void (async () => {
      try {
        const response = await fetch(AUTO_TRIGGER_ENDPOINT, {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ source: "page_visit" }),
        });

        const payload = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              accepted?: boolean;
              skipReason?: string | null;
              message?: string | null;
              error?: string | null;
            }
          | null;

        persistAutoTriggerResponse({
          recordedAt: new Date().toISOString(),
          httpStatus: response.status,
          ok: payload?.ok === true,
          accepted: payload?.accepted === true,
          skipReason:
            typeof payload?.skipReason === "string" ? payload.skipReason : null,
          message: typeof payload?.message === "string" ? payload.message : null,
          error: typeof payload?.error === "string" ? payload.error : null,
        });
      } catch (error) {
        persistAutoTriggerResponse({
          recordedAt: new Date().toISOString(),
          httpStatus: 0,
          ok: false,
          accepted: false,
          skipReason: null,
          message: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }, []);

  return null;
}
