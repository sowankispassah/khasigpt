"use client";

import { useEffect } from "react";

const AUTO_TRIGGER_ENDPOINT = "/api/jobs/auto-trigger";

export function JobsAutoScrapeTrigger() {
  useEffect(() => {
    void fetch(AUTO_TRIGGER_ENDPOINT, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ source: "page_visit" }),
    }).catch(() => {
      // Fire-and-forget: this must never block UI rendering.
    });
  }, []);

  return null;
}
