import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { isJobsEnabledForRole } from "@/lib/jobs/config";
import { listJobPostings } from "@/lib/jobs/service";

export const dynamic = "force-dynamic";

type JobsPageSearchParams = {
  q?: string;
  company?: string;
  location?: string;
  employmentType?: string;
  studyExam?: string;
  studyRole?: string;
  tag?: string;
};

const normalizeFilter = (value: string | undefined) => value?.trim().toLowerCase() ?? "";

const normalizeFilterKey = (value: string) => value.trim().toLowerCase();

export default async function JobsPage({
  searchParams,
}: {
  searchParams?: Promise<JobsPageSearchParams>;
}) {
  const session = await auth();
  const jobsEnabled = await isJobsEnabledForRole(session?.user?.role ?? null);

  if (!jobsEnabled) {
    notFound();
  }

  if (!session?.user) {
    redirect("/login?callbackUrl=/jobs");
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const qFilter = normalizeFilter(resolvedSearchParams?.q);
  const companyFilter = normalizeFilter(resolvedSearchParams?.company);
  const locationFilter = normalizeFilter(resolvedSearchParams?.location);
  const employmentTypeFilter = normalizeFilter(resolvedSearchParams?.employmentType);
  const studyExamFilter = normalizeFilter(resolvedSearchParams?.studyExam);
  const studyRoleFilter = normalizeFilter(resolvedSearchParams?.studyRole);
  const tagFilter = normalizeFilter(resolvedSearchParams?.tag);

  const jobs = await listJobPostings({ includeInactive: false });
  const filteredJobs = jobs.filter((job) => {
    if (
      companyFilter &&
      normalizeFilterKey(job.company) !== companyFilter
    ) {
      return false;
    }

    if (
      locationFilter &&
      normalizeFilterKey(job.location) !== locationFilter
    ) {
      return false;
    }

    if (
      employmentTypeFilter &&
      normalizeFilterKey(job.employmentType) !== employmentTypeFilter
    ) {
      return false;
    }

    if (studyExamFilter && normalizeFilterKey(job.studyExam) !== studyExamFilter) {
      return false;
    }

    if (studyRoleFilter && normalizeFilterKey(job.studyRole) !== studyRoleFilter) {
      return false;
    }

    if (
      tagFilter &&
      !job.tags.some((tag) => normalizeFilterKey(tag) === tagFilter)
    ) {
      return false;
    }

    if (!qFilter) {
      return true;
    }

    const haystack = [
      job.title,
      job.company,
      job.location,
      job.employmentType,
      job.studyExam,
      job.studyRole,
      job.tags.join(" "),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(qFilter);
  });

  const companies = Array.from(
    new Set(jobs.map((job) => job.company.trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  const locations = Array.from(
    new Set(jobs.map((job) => job.location.trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  const employmentTypes = Array.from(
    new Set(jobs.map((job) => job.employmentType.trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  const studyExams = Array.from(
    new Set(jobs.map((job) => job.studyExam.trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  const studyRoles = Array.from(
    new Set(jobs.map((job) => job.studyRole.trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  const tags = Array.from(
    new Set(
      jobs.flatMap((job) => job.tags.map((tag) => tag.trim()).filter(Boolean))
    )
  ).sort((a, b) => a.localeCompare(b));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-4 md:px-4 md:py-6">
      <div className="space-y-1">
        <h1 className="font-semibold text-2xl">Jobs</h1>
        <p className="text-muted-foreground text-sm">
          Browse uploaded job postings and start a focused Jobs chat for any role.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2 lg:grid-cols-6" method="get">
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm lg:col-span-2"
              defaultValue={resolvedSearchParams?.q ?? ""}
              name="q"
              placeholder="Search title, company, location, or tags"
            />
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              defaultValue={resolvedSearchParams?.company ?? ""}
              list="jobs-company-options"
              name="company"
              placeholder="Company"
            />
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              defaultValue={resolvedSearchParams?.location ?? ""}
              list="jobs-location-options"
              name="location"
              placeholder="Location"
            />
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              defaultValue={resolvedSearchParams?.employmentType ?? ""}
              list="jobs-employment-type-options"
              name="employmentType"
              placeholder="Employment type"
            />
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              defaultValue={resolvedSearchParams?.studyExam ?? ""}
              list="jobs-study-exam-options"
              name="studyExam"
              placeholder="Study exam"
            />
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              defaultValue={resolvedSearchParams?.studyRole ?? ""}
              list="jobs-study-role-options"
              name="studyRole"
              placeholder="Study role"
            />
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm"
              defaultValue={resolvedSearchParams?.tag ?? ""}
              list="jobs-tag-options"
              name="tag"
              placeholder="Tag"
            />
            <div className="flex items-center gap-2 md:col-span-2 lg:col-span-6">
              <Button className="cursor-pointer" size="sm" type="submit">
                Apply filters
              </Button>
              <Button asChild size="sm" type="button" variant="outline">
                <Link href="/jobs">Reset</Link>
              </Button>
            </div>
          </form>

          <datalist id="jobs-company-options">
            {companies.map((company) => (
              <option key={company} value={company} />
            ))}
          </datalist>
          <datalist id="jobs-location-options">
            {locations.map((location) => (
              <option key={location} value={location} />
            ))}
          </datalist>
          <datalist id="jobs-employment-type-options">
            {employmentTypes.map((employmentType) => (
              <option key={employmentType} value={employmentType} />
            ))}
          </datalist>
          <datalist id="jobs-study-exam-options">
            {studyExams.map((studyExam) => (
              <option key={studyExam} value={studyExam} />
            ))}
          </datalist>
          <datalist id="jobs-study-role-options">
            {studyRoles.map((studyRole) => (
              <option key={studyRole} value={studyRole} />
            ))}
          </datalist>
          <datalist id="jobs-tag-options">
            {tags.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
        </CardContent>
      </Card>

      <div className="text-muted-foreground text-sm">
        {filteredJobs.length} job{filteredJobs.length === 1 ? "" : "s"} found
      </div>

      <div className="grid gap-3">
        {filteredJobs.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              No jobs match the current filters.
            </CardContent>
          </Card>
        ) : (
          filteredJobs.map((job) => (
            <Card className="border-border/60" key={job.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{job.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-muted-foreground text-sm">
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
                <Button asChild className="cursor-pointer" size="sm" variant="outline">
                  <Link href={`/jobs/${job.id}`}>View details</Link>
                </Button>
                <Button asChild className="cursor-pointer" size="sm">
                  <Link href={`/chat?mode=jobs&new=1&jobId=${job.id}`}>
                    Ask about this job
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
