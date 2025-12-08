"use client";

import { ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { cn } from "@/lib/utils";

type BackToHomeButtonProps = {
  label: string;
  className?: string;
  href?: string;
};

export function BackToHomeButton({
  label,
  className,
  href = "/",
}: BackToHomeButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    for (const timerId of timersRef.current) {
      clearTimeout(timerId);
    }
    timersRef.current = [];
  }, []);

  const resetProgress = useCallback(() => {
    clearTimers();
    setShowProgress(false);
    setProgress(0);
  }, [clearTimers]);

  const startProgress = useCallback(() => {
    clearTimers();
    setShowProgress(true);
    setProgress(12);
    const timers = [
      setTimeout(() => setProgress(45), 120),
      setTimeout(() => setProgress(70), 260),
      setTimeout(() => setProgress(90), 520),
    ];
    timersRef.current = timers;
  }, [clearTimers]);

  useEffect(() => {
    if (!isPending) {
      resetProgress();
    }
  }, [isPending, resetProgress]);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const handleClick = () => {
    if (isPending) {
      return;
    }
    if (pathname === href) {
      resetProgress();
      return;
    }
    startProgress();
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <>
      {showProgress ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-40 h-1 bg-border/50"
        >
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
      <button
        aria-busy={isPending}
        aria-disabled={isPending}
        className={cn(
          "inline-flex cursor-pointer items-center gap-2 font-medium text-primary text-sm transition-colors hover:text-primary/80",
          isPending && "opacity-75",
          className
        )}
        onClick={handleClick}
        type="button"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        <span>{label}</span>
      </button>
    </>
  );
}
