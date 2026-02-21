import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isJobsEnabledForRole } from "@/lib/jobs/config";
import { getJobPostingById } from "@/lib/jobs/service";

export const dynamic = "force-dynamic";

export default async function JobPostingDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const session = await auth();
  const jobsEnabled = await isJobsEnabledForRole(session?.user?.role ?? null);

  if (!jobsEnabled) {
    notFound();
  }

  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/jobs/${id}`)}`);
  }

  const job = await getJobPostingById({
    id,
    includeInactive: false,
  });

  if (!job) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-4 md:px-4 md:py-6">
      <div className="flex items-center justify-between gap-2">
        <Button asChild className="cursor-pointer" size="sm" variant="ghost">
          <Link href="/jobs">Back to jobs</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">{job.title}</CardTitle>
          <CardDescription className="text-sm">
            {job.company} / {job.location}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 text-muted-foreground">
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-xs">
              {job.employmentType}
            </span>
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-xs">
              {job.studyExam}
            </span>
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-xs">
              {job.studyRole}
            </span>
            {job.studyYears.map((year) => (
              <span
                className="rounded-full border border-border/60 px-2 py-0.5 text-xs"
                key={`${job.id}-year-${year}`}
              >
                {year}
              </span>
            ))}
            {job.studyTags.map((tag) => (
              <span
                className="rounded-full border border-border/60 px-2 py-0.5 text-xs"
                key={`${job.id}-study-tag-${tag}`}
              >
                {tag}
              </span>
            ))}
            {job.tags.map((tag) => (
              <span
                className="rounded-full border border-border/60 px-2 py-0.5 text-xs"
                key={`${job.id}-tag-${tag}`}
              >
                {tag}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild className="cursor-pointer" size="sm">
              <Link href={`/chat?mode=jobs&new=1&jobId=${job.id}`}>
                Ask about this job
              </Link>
            </Button>
            {job.sourceUrl ? (
              <Button asChild className="cursor-pointer" size="sm" variant="outline">
                <a href={job.sourceUrl} rel="noreferrer" target="_blank">
                  Download source file
                </a>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Source document</CardTitle>
          <CardDescription>
            Preview the uploaded file used for this job posting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {job.sourceUrl ? (
            <div className="overflow-hidden rounded-lg border">
              <iframe className="h-[70vh] w-full" src={job.sourceUrl} title={job.title} />
            </div>
          ) : (
            <div className="rounded-lg border border-dashed px-4 py-8 text-center text-muted-foreground text-sm">
              No source file is available for this job posting.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
