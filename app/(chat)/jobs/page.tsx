import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { JobsAutoScrapeTrigger } from "@/components/jobs-auto-scrape-trigger";
import { ViewDetailsButton } from "@/components/jobs/view-details-button";
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
};

const normalizeFilter = (value: string | undefined) => value?.trim().toLowerCase() ?? "";

const normalizeFilterKey = (value: string) => value.trim().toLowerCase();

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function formatDateLabel(value: Date) {
  return value.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getSourceHostLabel(sourceUrl: string | null) {
  if (!sourceUrl) {
    return "Source unavailable";
  }

  try {
    return new URL(sourceUrl).hostname.replace(/^www\./i, "");
  } catch {
    return "Source available";
  }
}

function extractSalaryLabel(rawDescription: string) {
  const description = compactText(rawDescription);
  if (!description) {
    return "Not disclosed";
  }

  const salaryMatch = description.match(
    /(?:\u20b9|rs\.?|inr)\s?\d[\d,]*(?:\s*(?:-|to)\s*(?:\u20b9|rs\.?|inr)?\s?\d[\d,]*)?(?:\s*(?:per month|\/month|monthly|per annum|\/year|annum|lpa|lakhs? p\.?a\.?))?/i
  );
  if (salaryMatch?.[0]) {
    return salaryMatch[0].trim();
  }

  if (/\bas per norms\b/i.test(description)) {
    return "As per norms";
  }

  if (/\bnegotiable\b/i.test(description)) {
    return "Negotiable";
  }

  return "Not disclosed";
}

function extractDateByKeywordLabel({
  rawDescription,
  keywordPattern,
}: {
  rawDescription: string;
  keywordPattern: RegExp;
}) {
  const description = compactText(rawDescription);
  if (!description) {
    return null;
  }

  const datePattern =
    "(?:\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|\\d{1,2}\\s+[A-Za-z]{3,9}\\s+\\d{4}|[A-Za-z]{3,9}\\s+\\d{1,2},?\\s+\\d{4})";
  const expression = new RegExp(
    `(?:${keywordPattern.source})\\s*(?:for\\s*application)?\\s*[:\\-]?\\s*(${datePattern})`,
    "i"
  );
  const match = description.match(expression);
  return match?.[1] ? match[1].trim() : null;
}

function buildDescriptionSnippet(rawDescription: string) {
  const normalized = compactText(rawDescription);
  if (!normalized) {
    return "No description available.";
  }
  return normalized.length > 170 ? `${normalized.slice(0, 170)}...` : normalized;
}

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

    if (!qFilter) {
      return true;
    }

    const haystack = [
      job.title,
      job.company,
      job.location,
      job.employmentType,
      job.content,
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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-4 md:px-4 md:py-6">
      <JobsAutoScrapeTrigger />
      <div className="space-y-1">
        <h1 className="font-semibold text-2xl">Jobs</h1>
        <p className="text-muted-foreground text-sm">
          Browse scraped job postings and start a focused Jobs chat for any role.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filter jobs</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6" method="get">
            <input
              className="rounded-md border bg-background px-3 py-2 text-sm sm:col-span-2 lg:col-span-2"
              defaultValue={resolvedSearchParams?.q ?? ""}
              name="q"
              placeholder="Search title, company, location, or description"
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
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-6">
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
        </CardContent>
      </Card>

      <div className="text-muted-foreground text-sm">
        {filteredJobs.length} job{filteredJobs.length === 1 ? "" : "s"} found
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {filteredJobs.length === 0 ? (
          <Card className="md:col-span-2">
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              No jobs match the current filters.
            </CardContent>
          </Card>
        ) : (
          filteredJobs.map((job) => {
            const salaryLabel = extractSalaryLabel(job.content);
            const deadlineLabel =
              extractDateByKeywordLabel({
                rawDescription: job.content,
                keywordPattern:
                  /last\s*date|last\s*date\s*of\s*receipt|closing\s*date|apply\s*before|application\s*deadline|submission\s*deadline|deadline/,
              }) ?? "Not specified";
            const notificationDateLabel =
              extractDateByKeywordLabel({
                rawDescription: job.content,
                keywordPattern:
                  /notification\s*date|date\s*of\s*notification|advertisement\s*date|date\s*of\s*publication|published\s*on|date\s*of\s*issue|issue\s*date/,
              }) ?? formatDateLabel(job.createdAt);
            const sourceLabel = getSourceHostLabel(job.sourceUrl);
            const descriptionSnippet = buildDescriptionSnippet(job.content);

            return (
              <Card className="min-w-0 border-border/60" key={job.id}>
                <CardHeader className="space-y-1 pb-2">
                  <CardTitle className="line-clamp-2 text-base">{job.title}</CardTitle>
                  <p className="break-words text-muted-foreground text-sm">{job.company}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="line-clamp-3 break-words text-muted-foreground text-sm">
                    {descriptionSnippet}
                  </p>

                  <div className="grid grid-cols-1 gap-x-3 gap-y-1 text-[13px] sm:grid-cols-2 sm:text-xs">
                    <p className="break-words">
                      <span className="font-medium text-foreground">Location:</span>{" "}
                      {job.location}
                    </p>
                    <p className="break-words">
                      <span className="font-medium text-foreground">Type:</span>{" "}
                      {job.employmentType}
                    </p>
                    <p className="break-words">
                      <span className="font-medium text-foreground">Salary:</span>{" "}
                      {salaryLabel}
                    </p>
                    <p className="break-words">
                      <span className="font-medium text-foreground">Deadline:</span>{" "}
                      {deadlineLabel}
                    </p>
                    <p className="break-words">
                      <span className="font-medium text-foreground">Notification:</span>{" "}
                      {notificationDateLabel}
                    </p>
                    <p className="break-words">
                      <span className="font-medium text-foreground">Source:</span>{" "}
                      {sourceLabel}
                    </p>
                  </div>
                </CardContent>
                <CardFooter className="justify-end pt-0">
                  <ViewDetailsButton href={`/jobs/${job.id}`} />
                </CardFooter>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
