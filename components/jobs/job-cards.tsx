"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { JobCard } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

type JobCardsProps = {
  jobs: JobCard[];
  onView: (job: JobCard) => void;
  onAsk: (job: JobCard) => void;
  activeJobId?: string | null;
};

export function JobCards({
  jobs,
  onView,
  onAsk,
  activeJobId = null,
}: JobCardsProps) {
  return (
    <div className="flex flex-col gap-3" data-jobs-list="true">
      {jobs.map((job) => {
        const isSelected = activeJobId === job.id;
        return (
          <Card className="border-border/60" data-job-card-id={job.id} key={job.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{job.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <div>
                {job.company} / {job.location}
              </div>
              <div>
                Study: {job.studyExam} / {job.studyRole}
                {job.studyYears.length > 0
                  ? ` / ${job.studyYears.join(", ")}`
                  : ""}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-border/60 px-2 py-0.5 text-xs">
                  {job.employmentType}
                </span>
                {job.tags.map((tag) => (
                  <span
                    className="rounded-full border border-border/60 px-2 py-0.5 text-xs"
                    key={`${job.id}-${tag}`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </CardContent>
            <CardFooter className="gap-2">
              <Button
                className="cursor-pointer"
                onClick={() => onView(job)}
                size="sm"
                type="button"
                variant="outline"
              >
                View
              </Button>
              <Button
                aria-pressed={isSelected}
                className={cn("cursor-pointer", isSelected && "shadow-sm")}
                onClick={() => onAsk(job)}
                size="sm"
                type="button"
                variant={isSelected ? "default" : "outline"}
              >
                {isSelected ? "Selected" : "Ask"}
              </Button>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
