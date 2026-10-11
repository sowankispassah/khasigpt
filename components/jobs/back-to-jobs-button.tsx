"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { getJobsListReturn, getJobsListViewKey } from "@/lib/jobs/list-view-state";
import { startGlobalProgress } from "@/lib/ui/global-progress";

const JOBS_ROUTE = "/chat?mode=jobs";

export function BackToJobsButton() {
  const router = useRouter();
  const { data: session } = useSession();
  const { activeLanguage } = useTranslation();
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
        startGlobalProgress();
        const destination = getJobsListReturn(
          getJobsListViewKey(session?.user?.id, activeLanguage.code),
          window.location.pathname, window.history.length,
        );
        if (destination?.useHistoryBack) router.back();
        else router.push(destination?.href ?? JOBS_ROUTE, { scroll: false });
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
