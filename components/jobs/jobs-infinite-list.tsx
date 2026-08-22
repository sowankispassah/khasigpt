"use client";

import { BriefcaseBusiness, Building2, FileText, MapPin } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { ViewDetailsButton } from "@/components/jobs/view-details-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getJobTypeLabel } from "@/lib/jobs/sector";
import type { JobListItem } from "@/lib/jobs/types";

const JOBS_PAGE_SIZE = 12;

export function JobsInfiniteList({ jobs }: { jobs: JobListItem[] }) {
  const [visibleCount, setVisibleCount] = useState(Math.min(JOBS_PAGE_SIZE, jobs.length));
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    setVisibleCount(Math.min(JOBS_PAGE_SIZE, jobs.length));
    setIsLoadingMore(false);
  }, [jobs]);

  const visibleJobs = useMemo(() => jobs.slice(0, visibleCount), [jobs, visibleCount]);
  const hasMoreJobs = visibleCount < jobs.length;

  const handleManualLoadMore = useCallback(() => {
    if (isLoadingMore) {
      return;
    }
    setIsLoadingMore(true);
    window.setTimeout(() => {
      setVisibleCount((previous) =>
        Math.min(previous + JOBS_PAGE_SIZE, jobs.length)
      );
      setIsLoadingMore(false);
    }, 120);
  }, [isLoadingMore, jobs.length]);

  return (
    <>
      <div className="text-muted-foreground text-sm">
        Showing {visibleJobs.length} of {jobs.length} job
        {jobs.length === 1 ? "" : "s"}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {visibleJobs.length === 0 ? (
          <Card className="rounded-[28px] border-dashed md:col-span-2">
            <CardContent className="py-10 text-center text-muted-foreground text-sm">
              No jobs match the current filters.
            </CardContent>
          </Card>
        ) : (
          visibleJobs.map((job) => (
            <Card
              className="group min-w-0 overflow-hidden rounded-[28px] border-border/60 bg-gradient-to-br from-background via-background to-muted/30 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
              key={job.id}
            >
              <CardContent className="flex h-full flex-col gap-4 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="inline-flex max-w-full items-center gap-2 text-muted-foreground text-sm">
                      <Building2 className="h-4 w-4 shrink-0" />
                      <p className="line-clamp-1 break-words font-medium">{job.company}</p>
                    </div>
                    <h3 className="line-clamp-2 break-words font-semibold text-lg leading-snug">
                      {job.title}
                    </h3>
                  </div>
                  {job.hasPdfFile ? (
                    <span
                      className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-700"
                      title="PDF file available"
                    >
                      <FileText className="h-4 w-4" />
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <div className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-muted-foreground text-xs">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="line-clamp-1 break-words">{job.location}</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-muted-foreground text-xs">
                    <BriefcaseBusiness className="h-3.5 w-3.5 shrink-0" />
                    <span>{getJobTypeLabel(job.employmentType)}</span>
                  </div>
                </div>

                <div className="rounded-[20px] border border-border/60 bg-background/85 px-4 py-3">
                  <p className="break-words font-medium text-sm sm:text-[15px]">
                    <span className="text-muted-foreground">Salary:</span>{" "}
                    {job.salaryLabel}
                  </p>
                </div>

                <div className="mt-auto flex items-center gap-3">
                  <div className="min-w-0 flex-1 rounded-[20px] bg-muted/70 px-4 py-3">
                    <p className="truncate font-medium text-xs sm:text-sm">
                      <span className="text-muted-foreground">Notification:</span>{" "}
                      {job.notificationDateLabel}
                    </p>
                    <p className="mt-1 truncate text-muted-foreground text-xs sm:text-sm">
                      <span className="font-medium text-foreground/80">Fetched:</span>{" "}
                      {job.fetchedOnLabel}
                    </p>
                  </div>
                  <ViewDetailsButton href={`/jobs/${job.id}`} />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {hasMoreJobs ? (
        <div className="flex flex-col items-center justify-center gap-2 py-4">
          <Button
            className="cursor-pointer"
            disabled={isLoadingMore}
            onClick={handleManualLoadMore}
            size="sm"
            type="button"
            variant="outline"
          >
            {isLoadingMore ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin">
                  <LoaderIcon size={14} />
                </span>
                Loading...
              </span>
            ) : (
              "Load more jobs"
            )}
          </Button>
        </div>
      ) : jobs.length > 0 ? (
        <div className="py-2 text-center text-muted-foreground text-xs">
          No more jobs to load.
        </div>
      ) : null}
    </>
  );
}
