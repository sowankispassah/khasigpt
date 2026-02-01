"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";

const HEARTBEAT_INTERVAL_MS = 30_000;

export function UserPresenceTracker() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!session?.user?.id) {
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

    sendHeartbeat();

    timerRef.current = window.setInterval(
      sendHeartbeat,
      HEARTBEAT_INTERVAL_MS
    );

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        sendHeartbeat();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pathname, session?.user?.id]);

  return null;
}
