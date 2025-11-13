"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

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
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((timerId) => {
      clearTimeout(timerId);
    });
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
        type="button"
        className={cn(
          "inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80 cursor-pointer",
          isPending && "opacity-75",
          className
        )}
        onClick={handleClick}
        aria-busy={isPending}
        aria-disabled={isPending}
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        <span>{label}</span>
      </button>
    </>
  );
}
