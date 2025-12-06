"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const PROGRESS_STEPS = [
  { value: 12, delay: 0 },
  { value: 38, delay: 140 },
  { value: 64, delay: 320 },
  { value: 82, delay: 520 },
];

export function GlobalProgressBar() {
  const pathname = usePathname();
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const timeoutsRef = useRef<number[]>([]);
  const fallbackRef = useRef<number | null>(null);
  const prevPathRef = useRef<string | null>(pathname);

  const clearTimers = useCallback(() => {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
    if (fallbackRef.current !== null) {
      window.clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    clearTimers();
    setProgress(100);
    const hideId = window.setTimeout(() => {
      setIsVisible(false);
      setProgress(0);
    }, 220);
    timeoutsRef.current.push(hideId);
  }, [clearTimers]);

  const start = useCallback(() => {
    clearTimers();
    setIsVisible(true);
    PROGRESS_STEPS.forEach(({ value, delay }) => {
      const id = window.setTimeout(() => setProgress(value), delay);
      timeoutsRef.current.push(id);
    });
    fallbackRef.current = window.setTimeout(finish, 5000);
  }, [clearTimers, finish]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const clickable = target.closest(
        'button, a, [role="button"], [data-clickable], input[type="submit"], input[type="button"], [data-nav]'
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
      clearTimers();
    };
  }, [clearTimers, start]);

  useEffect(() => {
    if (prevPathRef.current !== null && prevPathRef.current !== pathname) {
      finish();
    }
    prevPathRef.current = pathname;
  }, [finish, pathname]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 bg-border/50"
    >
      <div
        className="h-full w-full origin-left scale-x-0 bg-primary transition-[transform] duration-200"
        style={{ transform: `scaleX(${progress / 100})` }}
      />
    </div>
  );
}
