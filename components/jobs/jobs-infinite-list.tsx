"use client";

import { FileText } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ViewDetailsButton } from "@/components/jobs/view-details-button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoaderIcon } from "@/components/icons";
import type { JobListItem } from "@/lib/jobs/types";

const JOBS_PAGE_SIZE = 10;

export function JobsInfiniteList({
  isGeneratingResponse = false,
  jobs,
  onResumeAutoLoad,
  pauseAutoLoad = false,
}: {
  isGeneratingResponse?: boolean;
  jobs: JobListItem[];
  onResumeAutoLoad?: () => void;
  pauseAutoLoad?: boolean;
}) {
  const [visibleCount, setVisibleCount] = useState(Math.min(JOBS_PAGE_SIZE, jobs.length));
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isResumingLoad, setIsResumingLoad] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(Math.min(JOBS_PAGE_SIZE, jobs.length));
    setIsLoadingMore(false);
    setIsResumingLoad(false);
  }, [jobs]);

  const visibleJobs = useMemo(() => jobs.slice(0, visibleCount), [jobs, visibleCount]);
  const hasMoreJobs = visibleCount < jobs.length;

  useEffect(() => {
    if (!hasMoreJobs || pauseAutoLoad) {
      return;
    }

    const sentinelNode = sentinelRef.current;
    if (!sentinelNode) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || isLoadingMore) {
            continue;
          }
          setIsLoadingMore(true);
          setVisibleCount((previous) => Math.min(previous + JOBS_PAGE_SIZE, jobs.length));
          break;
        }
      },
      { rootMargin: "220px" }
    );

    observer.observe(sentinelNode);
    return () => observer.disconnect();
  }, [hasMoreJobs, isLoadingMore, jobs.length, pauseAutoLoad]);

  useEffect(() => {
    if (!pauseAutoLoad) {
      return;
    }
    setIsLoadingMore(false);
  }, [pauseAutoLoad]);

  const handleManualLoadMore = () => {
    if (isResumingLoad) {
      return;
    }
    setIsResumingLoad(true);
    setIsLoadingMore(true);
    setVisibleCount((previous) => Math.min(previous + JOBS_PAGE_SIZE, jobs.length));
    onResumeAutoLoad?.();

    window.setTimeout(() => {
      setIsLoadingMore(false);
      setIsResumingLoad(false);
    }, 180);
  };

  useEffect(() => {
    if (!isLoadingMore) {
      return;
    }
    const timeout = window.setTimeout(() => setIsLoadingMore(false), 150);
    return () => window.clearTimeout(timeout);
  }, [isLoadingMore]);

  return (
    <>
      <div className="text-muted-foreground text-sm">
        Showing {visibleJobs.length} of {jobs.length} job
        {jobs.length === 1 ? "" : "s"}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {visibleJobs.length === 0 ? (
          <Card className="md:col-span-2">
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              No jobs match the current filters.
            </CardContent>
          </Card>
        ) : (
          visibleJobs.map((job) => (
            <Card className="min-w-0 border-border/60" key={job.id}>
              <CardHeader className="space-y-1 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="line-clamp-2 text-base">{job.title}</CardTitle>
                  {job.hasPdfFile ? (
                    <span
                      aria-label="PDF available"
                      className="shrink-0 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-1 text-emerald-700"
                      title="PDF file available"
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </span>
                  ) : null}
                </div>
                <p className="break-words text-muted-foreground text-sm">{job.company}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="line-clamp-3 break-words text-muted-foreground text-sm">
                  {job.descriptionSnippet}
                </p>

                <div className="grid grid-cols-1 gap-x-3 gap-y-1 text-[13px] sm:grid-cols-2 sm:text-xs">
                  <p className="break-words">
                    <span className="font-medium text-foreground">Location:</span> {job.location}
                  </p>
                  <p className="break-words">
                    <span className="font-medium text-foreground">Type:</span> {job.employmentType}
                  </p>
                  <p className="break-words">
                    <span className="font-medium text-foreground">Salary:</span> {job.salaryLabel}
                  </p>
                  <p className="break-words">
                    <span className="font-medium text-foreground">Deadline:</span> {job.deadlineLabel}
                  </p>
                  <p className="break-words">
                    <span className="font-medium text-foreground">Notification:</span>{" "}
                    {job.notificationDateLabel}
                  </p>
                  <p className="break-words">
                    <span className="font-medium text-foreground">Source:</span> {job.sourceLabel}
                  </p>
                </div>
              </CardContent>
              <CardFooter className="justify-end pt-0">
                <ViewDetailsButton href={`/jobs/${job.id}`} />
              </CardFooter>
            </Card>
          ))
        )}
      </div>

      {hasMoreJobs ? (
        <div className="flex flex-col items-center justify-center gap-2 py-4">
          <div aria-hidden className="h-px w-full" ref={sentinelRef} />
          <span className="flex items-center gap-2 text-muted-foreground text-xs">
            {pauseAutoLoad && isGeneratingResponse ? (
              "AI response in progress. Auto-load paused."
            ) : pauseAutoLoad ? (
              <Button
                className="cursor-pointer"
                disabled={isResumingLoad}
                onClick={handleManualLoadMore}
                size="sm"
                type="button"
                variant="outline"
              >
                {isResumingLoad ? "Loading..." : "Load more jobs"}
              </Button>
            ) : isLoadingMore ? (
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
      ) : jobs.length > 0 ? (
        <div className="py-2 text-center text-muted-foreground text-xs">
          No more jobs to load.
        </div>
      ) : null}
    </>
  );
}
