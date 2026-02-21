"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";

const HEARTBEAT_INTERVAL_MS = 60_000;
const HEARTBEAT_JITTER_MS = 5_000;
const PRESENCE_TRACKED_PATH_SEGMENTS = new Set([
  "chat",
  "forum",
  "profile",
  "subscriptions",
  "recharge",
  "creator-dashboard",
  "admin",
]);

function shouldTrackPresencePath(pathname: string | null) {
  if (!pathname) {
    return false;
  }

  const segments = pathname
    .toLowerCase()
    .split("/")
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return false;
  }

  if (PRESENCE_TRACKED_PATH_SEGMENTS.has(segments[0])) {
    return true;
  }

  // Locale-prefixed routes: /en/chat, /hi/forum, etc.
  if (
    segments.length > 1 &&
    segments[0].length <= 5 &&
    PRESENCE_TRACKED_PATH_SEGMENTS.has(segments[1])
  ) {
    return true;
  }

  return false;
}

export function UserPresenceTracker() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const timerRef = useRef<number | null>(null);
  const trackedPath = shouldTrackPresencePath(pathname);

  useEffect(() => {
    if (!session?.user?.id || !trackedPath) {
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
  }, [pathname, session?.user?.id, trackedPath]);

  return null;
}
