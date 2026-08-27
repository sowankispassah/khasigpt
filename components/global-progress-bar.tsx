"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  addGlobalProgressDoneListener,
  addGlobalProgressStartListener,
  startGlobalProgress,
} from "@/lib/ui/global-progress";

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
  const intervalRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const failSafeTimerRef = useRef<number | null>(null);
  const pendingStartTimerRef = useRef<number | null>(null);
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

  const clearPendingStartTimer = useCallback(() => {
    if (pendingStartTimerRef.current !== null) {
      window.clearTimeout(pendingStartTimerRef.current);
      pendingStartTimerRef.current = null;
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
      const delta = Math.max(0.6, (MAX_PENDING_PROGRESS - current) * 0.16);
      const next = Math.min(MAX_PENDING_PROGRESS, current + delta);
      return next;
    });
  }, []);

  const ensureTicking = useCallback(() => {
    if (intervalRef.current !== null) {
      return;
    }
    intervalRef.current = window.setInterval(tick, TICK_INTERVAL);
  }, [tick]);

  const start = useCallback(() => {
    clearPendingStartTimer();
    clearHideTimer();
    clearFailSafeTimer();
    isVisibleRef.current = true;
    setIsVisible(true);
    setProgress((current) =>
      current > 0 && current < MAX_PENDING_PROGRESS ? current : START_PROGRESS
    );
    ensureTicking();
    failSafeTimerRef.current = window.setTimeout(() => {
      setProgress(100);
      scheduleHide();
    }, 15000);
  }, [
    clearFailSafeTimer,
    clearHideTimer,
    clearPendingStartTimer,
    ensureTicking,
    scheduleHide,
  ]);

  const done = useCallback(() => {
    if (!isVisibleRef.current) {
      return;
    }
    setProgress(100);
    scheduleHide();
  }, [scheduleHide]);

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
      // Avoid doing synchronous work inside the click handler (this can make
      // navigation feel laggy on low-end devices). If the navigation is slow,
      // we'll show the progress bar shortly after.
      const clickable = target.closest('a[href], [data-nav]');
      if (clickable) {
        clearPendingStartTimer();
        pendingStartTimerRef.current = window.setTimeout(() => {
          start();
        }, 120);
      }
    };
    const handlePopState = () => startGlobalProgress();

    window.addEventListener("click", handleClick, { capture: true });
    window.addEventListener("popstate", handlePopState);
    const removeStartListener = addGlobalProgressStartListener(start);
    const removeDoneListener = addGlobalProgressDoneListener(done);

    return () => {
      window.removeEventListener("click", handleClick, { capture: true });
      window.removeEventListener("popstate", handlePopState);
      removeStartListener();
      removeDoneListener();
      clearHideTimer();
      clearFailSafeTimer();
      clearPendingStartTimer();
      stopTicking();
    };
  }, [
    clearFailSafeTimer,
    clearHideTimer,
    clearPendingStartTimer,
    done,
    start,
    stopTicking,
  ]);

  useEffect(() => {
    const changed = prevPathRef.current !== null && prevPathRef.current !== pathname;
    if (changed) {
      clearPendingStartTimer();
      done();
    }
    prevPathRef.current = pathname;
  }, [clearPendingStartTimer, done, pathname]);

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
