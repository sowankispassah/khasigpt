import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { ExternalPreviewFrame } from "@/components/jobs/external-preview-frame";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isJobsEnabledForRole } from "@/lib/jobs/config";
import { getJobPostingById } from "@/lib/jobs/service";

export const dynamic = "force-dynamic";

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

function isPdfUrl(url: string | null) {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.pathname.toLowerCase().endsWith(".pdf");
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

function resolvePdfUrl({
  sourceUrl,
  pdfSourceUrl,
  pdfCachedUrl,
  content,
}: {
  sourceUrl: string | null;
  pdfSourceUrl: string | null;
  pdfCachedUrl: string | null;
  content: string;
}) {
  if (isPdfUrl(pdfCachedUrl)) {
    return pdfCachedUrl;
  }
  if (isPdfUrl(pdfSourceUrl)) {
    return pdfSourceUrl;
  }
  if (isPdfUrl(sourceUrl)) {
    return sourceUrl;
  }
  return extractPdfUrlFromContent(content);
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
  const pdfUrl = resolvePdfUrl({
    sourceUrl: job.sourceUrl,
    pdfSourceUrl: job.pdfSourceUrl,
    pdfCachedUrl: job.pdfCachedUrl,
    content: job.content,
  });
  const proxiedPdfUrl = pdfUrl ? `/api/jobs/${job.id}/pdf` : null;
  const sourcePreviewUrl = job.sourceUrl && !isPdfUrl(job.sourceUrl) ? job.sourceUrl : null;
  const hasAnyFileLinks = Boolean(proxiedPdfUrl || sourcePreviewUrl);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-4 md:px-4 md:py-6">
      <div className="flex items-center justify-between gap-2">
        <Button asChild className="cursor-pointer" size="sm" variant="ghost">
          <Link href="/jobs">Back to jobs</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="break-words text-xl sm:text-2xl">{job.title}</CardTitle>
          <CardDescription className="text-sm">
            {job.company} / {job.location}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 text-sm md:grid-cols-2">
            <p className="break-words">
              <span className="font-medium">Location:</span> {job.location}
            </p>
            <p className="break-words">
              <span className="font-medium">Type:</span> {job.employmentType}
            </p>
            <p className="break-words">
              <span className="font-medium">Salary:</span> {salaryLabel}
            </p>
            <p className="break-words">
              <span className="font-medium">Deadline:</span> {deadlineLabel}
            </p>
            <p className="break-words">
              <span className="font-medium">Notification date:</span>{" "}
              {notificationDateLabel}
            </p>
            <p className="break-words">
              <span className="font-medium">Source:</span> {sourceLabel}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild className="w-full cursor-pointer sm:w-auto" size="sm">
              <Link href={`/chat?mode=jobs&new=1&jobId=${job.id}`}>
                Ask about this job
              </Link>
            </Button>
            {job.sourceUrl ? (
              <Button
                asChild
                className="w-full cursor-pointer sm:w-auto"
                size="sm"
                variant="outline"
              >
                <a href={job.sourceUrl} rel="noreferrer" target="_blank">
                  Open source listing
                </a>
              </Button>
            ) : null}
            {proxiedPdfUrl ? (
              <Button
                asChild
                className="w-full cursor-pointer sm:w-auto"
                size="sm"
                variant="outline"
              >
                <a href={proxiedPdfUrl} rel="noreferrer" target="_blank">
                  Open PDF file
                </a>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {proxiedPdfUrl ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">About the job</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <a
                  className="cursor-pointer text-primary text-sm underline underline-offset-2"
                  href={proxiedPdfUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open PDF in new tab
                </a>
              </div>
              <ExternalPreviewFrame
                format="pdf"
                heightClassName="h-[58vh] sm:h-[68vh] md:h-[75vh]"
                src={proxiedPdfUrl}
                title={`${job.title} PDF`}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {hasAnyFileLinks && sourcePreviewUrl ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Original source page</CardTitle>
            <CardDescription>Open the original listing in a new tab.</CardDescription>
          </CardHeader>
          <CardContent>
            <a
              className="cursor-pointer break-all text-primary text-sm underline underline-offset-2"
              href={sourcePreviewUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open source page in new tab
            </a>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
