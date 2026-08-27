"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const HEARTBEAT_INTERVAL_MS = 60_000;
const HEARTBEAT_JITTER_MS = 5_000;
const PRESENCE_DISABLED_IN_DEV =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_ENABLE_PRESENCE_IN_DEV !== "1";

function shouldTrackPresencePath(pathname: string | null) {
  return Boolean(pathname);
}

export function UserPresenceTracker({ userId }: { userId: string }) {
  const pathname = usePathname();
  const timerRef = useRef<number | null>(null);
  const trackedPath = shouldTrackPresencePath(pathname);

  useEffect(() => {
    if (PRESENCE_DISABLED_IN_DEV) {
      return undefined;
    }

    if (!userId || !trackedPath) {
      return undefined;
    }

    const sendHeartbeat = () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return;
      }
      if (typeof document !== "undefined") {
        if (document.visibilityState !== "visible") {
          return;
        }
      }

      const locale =
        typeof navigator !== "undefined" ? navigator.language : null;
      const timezone =
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : null;

      fetch("/api/activity/heartbeat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          path: pathname,
          locale,
          timezone,
        }),
        keepalive: true,
      }).catch(() => {
        // Silent failure: presence updates are best-effort.
      });
    };

    const scheduleNextHeartbeat = () => {
      const jitter = Math.floor(Math.random() * HEARTBEAT_JITTER_MS);
      timerRef.current = window.setTimeout(() => {
        sendHeartbeat();
        scheduleNextHeartbeat();
      }, HEARTBEAT_INTERVAL_MS + jitter);
    };

    sendHeartbeat();
    scheduleNextHeartbeat();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        sendHeartbeat();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pathname, trackedPath, userId]);

  return null;
}
