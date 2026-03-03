"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LoaderIcon } from "@/components/icons";

type JobsAutoLoadMoreProps = {
  href: string;
  enabled: boolean;
};

export function JobsAutoLoadMore({ href, enabled }: JobsAutoLoadMoreProps) {
  const router = useRouter();
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    setIsNavigating(false);
  }, [href]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const sentinelNode = sentinelRef.current;
    if (!sentinelNode) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !isNavigating) {
            setIsNavigating(true);
            router.push(href, { scroll: false });
            break;
          }
        }
      },
      { rootMargin: "220px" }
    );

    observer.observe(sentinelNode);

    return () => {
      observer.disconnect();
    };
  }, [enabled, href, isNavigating, router]);

  if (!enabled) {
    return null;
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-4">
      <div aria-hidden className="h-px w-full" ref={sentinelRef} />
      <span className="flex items-center gap-2 text-muted-foreground text-xs">
        {isNavigating ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin">
              <LoaderIcon size={14} />
            </span>
            Loading more jobs...
          </>
        ) : (
          "Scroll down to load more jobs"
        )}
      </span>
    </div>
  );
}
