import { NextResponse } from "next/server";
import { getJobsAccessForRole } from "@/lib/jobs/config";
import { resolveJobNotificationDateLabel } from "@/lib/jobs/dates";
import { resolveJobSalaryInfo } from "@/lib/jobs/salary";
import { getJobTypeLabel } from "@/lib/jobs/sector";
import { getJobPostingById } from "@/lib/jobs/service";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { createJobPreviewToken } from "@/lib/mobile-auth-token";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const JOB_DETAIL_TIMEOUT_MS = 7000;

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

function resolvePdfUrl({
  content,
  pdfCachedUrl,
  pdfSourceUrl,
  sourceUrl,
}: {
  content: string;
  pdfCachedUrl: string | null;
  pdfSourceUrl: string | null;
  sourceUrl: string | null;
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

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getMobileSession(request);
  if (!session?.user) {
    return NextResponse.json(
      {
        code: "unauthorized:auth",
        message: "You must be signed in.",
      },
      { status: 401 }
    );
  }

  const jobsAccess = await getJobsAccessForRole(session.user.role ?? null);
  if (!jobsAccess.enabled) {
    return NextResponse.json(
      {
        code: "forbidden:auth",
        message: "Jobs access is disabled for your role.",
      },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  const job = await withTimeout(
    getJobPostingById({
      id,
      includeInactive: false,
      includeRagState: false,
    }),
    JOB_DETAIL_TIMEOUT_MS,
    () => {
      console.error("[api/mobile/jobs/detail] Job detail read timed out.", {
        jobId: id,
        timeoutMs: JOB_DETAIL_TIMEOUT_MS,
      });
    }
  ).catch((error) => {
    console.error("[api/mobile/jobs/detail] Job detail read failed.", {
      error,
      jobId: id,
    });
    return undefined;
  });

  if (job === undefined) {
    return NextResponse.json(
      {
        code: "unavailable:job",
        message: "Job details could not be loaded right now. Please retry.",
        meta: {
          degradedSections: ["jobDetail"],
        },
      },
      { status: 503 }
    );
  }

  if (!job) {
    return NextResponse.json(
      {
        code: "not_found:job",
        message: "Job not found.",
      },
      { status: 404 }
    );
  }

  const detailMarkdown = job.content.trim() || job.pdfContent?.trim() || "";
  const pdfMetaText = job.pdfContent?.trim() || null;
  const salaryInfo = resolveJobSalaryInfo({
    salary: job.salary,
    content: detailMarkdown,
    pdfContent: pdfMetaText,
    extractedData: job.pdfExtractedData,
  });
  const pdfUrl = resolvePdfUrl({
    content: job.content,
    pdfCachedUrl: job.pdfCachedUrl,
    pdfSourceUrl: job.pdfSourceUrl,
    sourceUrl: job.sourceUrl,
  });
  const proxiedPdfUrl = pdfUrl ? `/api/jobs/${job.id}/pdf` : null;
  const sourceLabel = getSourceHostLabel(job.sourceUrl);
  const previewToken = proxiedPdfUrl ? createJobPreviewToken(job.id) : null;

  return NextResponse.json(
    {
      meta: {
        degradedSections: jobsAccess.degraded ? ["featureGate"] : [],
      },
      id: job.id,
      title: job.title,
      company: job.company,
      companyLocationLabel: `${sourceLabel} / ${job.location}`,
      location: job.location,
      employmentType: getJobTypeLabel(job.employmentType),
      salaryLabel: salaryInfo.summary,
      notificationDateLabel: resolveJobNotificationDateLabel({
        content: detailMarkdown,
        pdfContent: pdfMetaText,
        referenceDate: job.createdAt,
        extractedData: job.pdfExtractedData,
      }),
      fetchedOnLabel: formatDateLabel(job.createdAt),
      sourceLabel,
      sourceUrl: job.sourceUrl,
      pdfUrl: proxiedPdfUrl,
      pdfPreviewImageUrl: proxiedPdfUrl && previewToken
        ? `/api/mobile/jobs/${job.id}/preview-image?token=${encodeURIComponent(
            previewToken
          )}`
        : null,
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    }
  );
}
