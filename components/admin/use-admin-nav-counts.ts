"use client";

import { useEffect, useState } from "react";

export type AdminNavBadgeKey =
  | "accountDeletionRequests"
  | "contacts"
  | "reports"
  | "storage"
  | "users";

export type AdminNavBadgeCounts = Partial<Record<AdminNavBadgeKey, number>>;

const BADGE_KEYS: AdminNavBadgeKey[] = [
  "accountDeletionRequests",
  "contacts",
  "reports",
  "storage",
  "users",
];
const REFRESH_INTERVAL_MS = 120_000;
// Focus and visibility events fire in bursts; one refresh per window is enough.
const MIN_FOCUS_REFRESH_GAP_MS = 30_000;
// Let the page's own streamed data finish before badges compete for the DB.
const INITIAL_REFRESH_DELAY_MS = 1500;
const REQUEST_TIMEOUT_MS = 15_000;

function isConfirmedCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Keeps the last confirmed value for any count the server could not confirm. */
function mergeConfirmedCounts(
  previous: AdminNavBadgeCounts,
  body: Record<string, unknown>
) {
  let changed = false;
  const next = { ...previous };
  for (const key of BADGE_KEYS) {
    const value = body[key];
    if (isConfirmedCount(value) && next[key] !== value) {
      next[key] = value;
      changed = true;
    }
  }
  return changed ? next : previous;
}

export function useAdminNavCounts(initialCounts: AdminNavBadgeCounts = {}) {
  const [counts, setCounts] = useState<AdminNavBadgeCounts>(initialCounts);

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController | undefined;
    let lastStartedAt = 0;

    async function load() {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      lastStartedAt = Date.now();
      const timeout = window.setTimeout(() => current.abort(), REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch("/api/admin/nav-counts", {
          cache: "no-store",
          credentials: "same-origin",
          signal: current.signal,
        });
        if (!response.ok) return;
        const body = (await response.json()) as Record<string, unknown>;
        if (!cancelled && !current.signal.aborted) {
          setCounts((previous) => mergeConfirmedCounts(previous, body));
        }
      } catch {
        // Optional badges: keep the last confirmed counts and never block navigation.
      } finally {
        window.clearTimeout(timeout);
      }
    }

    const refresh = (force: boolean) => {
      if (document.visibilityState !== "visible") return;
      if (!force && Date.now() - lastStartedAt < MIN_FOCUS_REFRESH_GAP_MS) return;
      void load();
    };
    const refreshOnFocus = () => refresh(false);
    const refreshAfterChange = () => refresh(true);
    const applyDeletionCount = (event: Event) => {
      const count = (event as CustomEvent<{ count?: unknown }>).detail?.count;
      if (isConfirmedCount(count)) {
        setCounts((previous) => ({ ...previous, accountDeletionRequests: count }));
        return;
      }
      refreshAfterChange();
    };

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    window.addEventListener("admin:users-unviewed-count", refreshAfterChange);
    window.addEventListener("admin:contact-unread-counts", refreshAfterChange);
    window.addEventListener("admin:account-deletion-unviewed-count", applyDeletionCount);
    const initial = window.setTimeout(refreshAfterChange, INITIAL_REFRESH_DELAY_MS);
    const interval = window.setInterval(refreshAfterChange, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      controller?.abort();
      window.clearTimeout(initial);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
      window.removeEventListener("admin:users-unviewed-count", refreshAfterChange);
      window.removeEventListener("admin:contact-unread-counts", refreshAfterChange);
      window.removeEventListener("admin:account-deletion-unviewed-count", applyDeletionCount);
    };
  }, []);

  return counts;
}
