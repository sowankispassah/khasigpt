"use client";

import { useEffect, useState } from "react";
import { millisecondsUntilLocalMidnight } from "@/lib/chat/date-separators";

export function useLocalCalendarClock() {
  // Defer timezone-dependent text until hydration on the user's device.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const current = new Date();
      setNow(current);
      timer = setTimeout(refresh, millisecondsUntilLocalMidnight(current));
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return now;
}
