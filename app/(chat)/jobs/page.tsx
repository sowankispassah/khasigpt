import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { JobsInfiniteList } from "@/components/jobs/jobs-infinite-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isJobsEnabledForRole } from "@/lib/jobs/config";
import { listJobPostings } from "@/lib/jobs/service";
import { type JobListItem } from "@/lib/jobs/types";

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

function isPdfUrl(url: string | null) {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    return pathname.endsWith(".pdf") || pathname.includes(".pdf");
  } catch {
    return false;
  }
}

function extractPdfUrlFromContent(content: string) {
  const match = content.match(/PDF Source:\s*(https?:\/\/\S+)/i);
  if (!match?.[1]) {
    return null;
  }
  const candidate = match[1].replace(/[),.;]+$/g, "");
  try {
    return new URL(candidate).toString();
  } catch {
    return null;
  }
}

function hasJobPdfFile(job: {
  sourceUrl: string | null;
  pdfSourceUrl: string | null;
  pdfCachedUrl: string | null;
  content: string;
}) {
  return Boolean(
    isPdfUrl(job.pdfCachedUrl) ||
      isPdfUrl(job.pdfSourceUrl) ||
      isPdfUrl(job.sourceUrl) ||
      extractPdfUrlFromContent(job.content)
  );
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
  const filteredJobCards: JobListItem[] = filteredJobs.map((job) => ({
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    employmentType: job.employmentType,
    salaryLabel: extractSalaryLabel(job.content),
    deadlineLabel:
      extractDateByKeywordLabel({
        rawDescription: job.content,
        keywordPattern:
          /last\s*date|last\s*date\s*of\s*receipt|closing\s*date|apply\s*before|application\s*deadline|submission\s*deadline|deadline/,
      }) ?? "Not specified",
    notificationDateLabel:
      extractDateByKeywordLabel({
        rawDescription: job.content,
        keywordPattern:
          /notification\s*date|date\s*of\s*notification|advertisement\s*date|date\s*of\s*publication|published\s*on|date\s*of\s*issue|issue\s*date/,
      }) ?? formatDateLabel(job.createdAt),
    sourceLabel: getSourceHostLabel(job.sourceUrl),
    descriptionSnippet: buildDescriptionSnippet(job.content),
    hasPdfFile: hasJobPdfFile(job),
  }));

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
      <div className="flex items-center justify-between gap-2">
        <Button asChild className="cursor-pointer" size="sm" variant="ghost">
          <Link href="/">Back to home</Link>
        </Button>
      </div>

      <div className="space-y-1">
        <h1 className="font-semibold text-2xl">Jobs</h1>
        <p className="text-muted-foreground text-sm">
          Browse jobs posted across Meghalaya.
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

      <JobsInfiniteList jobs={filteredJobCards} />
    </div>
  );
}
