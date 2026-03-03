"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

const JOBS_ROUTE = "/jobs";

export function BackToJobsButton() {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    router.prefetch(JOBS_ROUTE);
  }, [router]);

  const prefetchJobsRoute = () => {
    router.prefetch(JOBS_ROUTE);
  };

  return (
    <Button
      className="cursor-pointer"
      disabled={isNavigating}
      onClick={() => {
        if (isNavigating) {
          return;
        }
        setIsNavigating(true);
        router.push(JOBS_ROUTE);
      }}
      onFocus={prefetchJobsRoute}
      onMouseEnter={prefetchJobsRoute}
      onTouchStart={prefetchJobsRoute}
      size="sm"
      type="button"
      variant="ghost"
    >
      {isNavigating ? (
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 animate-spin">
            <LoaderIcon size={16} />
          </span>
          <span>Opening...</span>
        </span>
      ) : (
        "Back to jobs"
      )}
    </Button>
  );
}
