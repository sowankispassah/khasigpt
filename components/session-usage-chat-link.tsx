"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

type SessionUsageChatLinkProps = {
  href: string;
  children: ReactNode;
  className?: string;
};

export function SessionUsageChatLink({
  href,
  children,
  className,
}: SessionUsageChatLinkProps) {
  const router = useRouter();
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

  const startProgress = useCallback(() => {
    clearTimers();
    setShowProgress(true);
    setProgress(15);
    const timers = [
      setTimeout(() => setProgress(40), 120),
      setTimeout(() => setProgress(72), 280),
      setTimeout(() => setProgress(92), 520),
    ];
    timersRef.current = timers;
  }, [clearTimers]);

  const resetProgress = useCallback(() => {
    clearTimers();
    setShowProgress(false);
    setProgress(0);
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

  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.altKey ||
        event.ctrlKey ||
        event.shiftKey
      ) {
        return;
      }

      event.preventDefault();
      if (isPending) {
        return;
      }

      startProgress();
      startTransition(() => {
        router.push(href);
      });
    },
    [href, isPending, router, startProgress]
  );

  return (
    <>
      {showProgress ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-50 h-1 bg-border/50"
        >
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
      <Link className={className} href={href} onClick={handleClick} prefetch>
        {children}
      </Link>
    </>
  );
}
