"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// A lightweight, nprogress-like bar tuned for App Router.
// It advances smoothly toward 90% while work is in-flight,
// then finishes quickly once network and navigation settle.
const START_PROGRESS = 8;
const MAX_PENDING_PROGRESS = 92;
const TICK_INTERVAL = 120;

export function GlobalProgressBar() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const isVisibleRef = useRef(false);
  const pendingFetchesRef = useRef(0);
  const originalFetchRef = useRef<typeof fetch | null>(null);
  const intervalRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const failSafeTimerRef = useRef<number | null>(null);
  const prevPathRef = useRef<string | null>(pathname);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const clearFailSafeTimer = useCallback(() => {
    if (failSafeTimerRef.current !== null) {
      window.clearTimeout(failSafeTimerRef.current);
      failSafeTimerRef.current = null;
    }
  }, []);

  const stopTicking = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    clearFailSafeTimer();
    hideTimerRef.current = window.setTimeout(() => {
      isVisibleRef.current = false;
      setIsVisible(false);
      setProgress(0);
      stopTicking();
    }, 220);
  }, [clearFailSafeTimer, clearHideTimer, stopTicking]);

  const tick = useCallback(() => {
    setProgress((current) => {
      const hasPending = pendingFetchesRef.current > 0;
      const target = hasPending ? MAX_PENDING_PROGRESS : 100;
      const rate = hasPending ? 0.16 : 0.35;
      const minStep = hasPending ? 0.6 : 2.5;
      const delta = Math.max(minStep, (target - current) * rate);
      const next = Math.min(target, current + delta);

      if (!hasPending && next >= 99.5) {
        scheduleHide();
      }

      return next;
    });
  }, [scheduleHide]);

  const ensureTicking = useCallback(() => {
    if (intervalRef.current !== null) {
      return;
    }
    intervalRef.current = window.setInterval(tick, TICK_INTERVAL);
  }, [tick]);

  const start = useCallback(() => {
    clearHideTimer();
    clearFailSafeTimer();
    isVisibleRef.current = true;
    setIsVisible(true);
    setProgress((current) =>
      current > 0 && current < MAX_PENDING_PROGRESS ? current : START_PROGRESS
    );
    ensureTicking();
    failSafeTimerRef.current = window.setTimeout(() => {
      pendingFetchesRef.current = 0;
      setProgress(100);
      scheduleHide();
    }, 15000);
  }, [clearFailSafeTimer, clearHideTimer, ensureTicking, scheduleHide]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hidePreload =
      (window as unknown as { __hidePreloadProgress?: () => void })
        .__hidePreloadProgress;
    if (typeof hidePreload === "function") {
      hidePreload();
    }
  }, []);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      const clickable = target.closest(
        'button, a, summary, label[for], [role="button"], [role="tab"], [role="link"], [data-clickable], input[type="submit"], input[type="button"], [data-nav], .cursor-pointer'
      );
      if (clickable) {
        start();
      }
    };
    const handlePopState = () => start();

    window.addEventListener("click", handleClick, { capture: true });
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("click", handleClick, { capture: true });
      window.removeEventListener("popstate", handlePopState);
      clearHideTimer();
      clearFailSafeTimer();
      stopTicking();
    };
  }, [clearFailSafeTimer, clearHideTimer, start, stopTicking]);

  useEffect(() => {
    const changed = prevPathRef.current !== null && prevPathRef.current !== pathname;
    if (changed) {
      pendingFetchesRef.current = 0;
      setProgress((current) => Math.max(current, 96));
      scheduleHide();
    }
    prevPathRef.current = pathname;
  }, [pathname, scheduleHide]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const originalFetch = window.fetch;
    originalFetchRef.current = originalFetch;

    window.fetch = async (...args) => {
      const shouldTrack = isVisibleRef.current;
      if (shouldTrack) {
        pendingFetchesRef.current += 1;
        clearHideTimer();
        ensureTicking();
      }
      try {
        const response = await originalFetch(...args);
        return response;
      } finally {
        if (shouldTrack) {
          pendingFetchesRef.current = Math.max(
            0,
            pendingFetchesRef.current - 1
          );
          if (pendingFetchesRef.current === 0) {
            setProgress((current) => Math.max(current, 96));
            scheduleHide();
          }
        }
      }
    };

    return () => {
      pendingFetchesRef.current = 0;
      stopTicking();
      clearHideTimer();
      clearFailSafeTimer();
      if (originalFetchRef.current) {
        window.fetch = originalFetchRef.current;
      }
    };
  }, [
    clearFailSafeTimer,
    clearHideTimer,
    ensureTicking,
    scheduleHide,
    stopTicking,
  ]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 bg-border/50"
    >
      <div
        className="h-full w-full origin-left scale-x-0 bg-primary transition-[transform] duration-150 ease-out"
        style={{ transform: `scaleX(${progress / 100})` }}
      />
    </div>
  );
}
