"use client";

import { useMemo, useState } from "react";
import { JobsInfiniteList, type JobListItem } from "@/components/jobs/jobs-infinite-list";
import { JobsChatPanel } from "@/components/jobs/jobs-chat-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type JobsPageContentProps = {
  jobs: JobListItem[];
};

export function JobsPageContent({ jobs }: JobsPageContentProps) {
  const [aiFilteredJobIds, setAiFilteredJobIds] = useState<string[] | null>(null);

  const visibleJobs = useMemo(() => {
    if (aiFilteredJobIds === null) {
      return jobs;
    }

    const idSet = new Set(aiFilteredJobIds);
    return jobs.filter((job) => idSet.has(job.id));
  }, [aiFilteredJobIds, jobs]);

  const aiFilterActive = aiFilteredJobIds !== null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start">
      <div className="space-y-3">
        {aiFilterActive ? (
          <Card className="border-border/70 bg-muted/20">
            <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
              <p className="text-sm">
                AI filter active: showing <span className="font-medium">{visibleJobs.length}</span> of{" "}
                <span className="font-medium">{jobs.length}</span> jobs.
              </p>
              <Button
                className="cursor-pointer"
                onClick={() => setAiFilteredJobIds(null)}
                size="sm"
                type="button"
                variant="outline"
              >
                Clear AI filter
              </Button>
            </CardContent>
          </Card>
        ) : null}

        <JobsInfiniteList jobs={visibleJobs} />
      </div>

      <JobsChatPanel onApplyJobIds={setAiFilteredJobIds} />
    </div>
  );
}
