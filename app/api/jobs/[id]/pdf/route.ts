import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { isJobsEnabledForRole } from "@/lib/jobs/config";
import { getJobPostingById } from "@/lib/jobs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function toSafeFilename(title: string) {
  const stem = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${stem || "job-details"}.pdf`;
}

function isInternalCachedPdfUrl(url: string | null) {
  if (!url) {
    return false;
  }

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return (
      hostname.includes("vercel-storage.com") ||
      hostname.includes("supabase.co") ||
      hostname.includes("supabase.net")
    );
  } catch {
    return false;
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      {
        code: "unauthorized:auth",
        message: "You must be signed in.",
      },
      { status: 401 }
    );
  }

  const jobsEnabled = await isJobsEnabledForRole(session.user.role ?? null);
  if (!jobsEnabled) {
    return NextResponse.json(
      {
        code: "forbidden:auth",
        message: "Jobs access is disabled for your role.",
      },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json(
      {
        code: "bad_request:validation",
        message: "Missing job id.",
      },
      { status: 400 }
    );
  }

  const job = await getJobPostingById({
    id,
    includeInactive: false,
  });
  if (!job) {
    return NextResponse.json(
      {
        code: "not_found:job",
        message: "Job not found.",
      },
      { status: 404 }
    );
  }

  const pdfUrl = resolvePdfUrl({
    sourceUrl: job.sourceUrl,
    pdfSourceUrl: job.pdfSourceUrl,
    pdfCachedUrl: job.pdfCachedUrl,
    content: job.content,
  });
  if (!pdfUrl) {
    return NextResponse.json(
      {
        code: "not_found:pdf",
        message: "No PDF available for this job.",
      },
      { status: 404 }
    );
  }

  const forwardHeaders = new Headers({
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
  });
  const range = request.headers.get("range");
  if (range) {
    forwardHeaders.set("range", range);
  }
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch) {
    forwardHeaders.set("if-none-match", ifNoneMatch);
  }
  const ifModifiedSince = request.headers.get("if-modified-since");
  if (ifModifiedSince) {
    forwardHeaders.set("if-modified-since", ifModifiedSince);
  }

  let upstream: Response;
  try {
    upstream = await fetch(pdfUrl, {
      method: "GET",
      headers: forwardHeaders,
      redirect: "follow",
      cache: "force-cache",
      signal: request.signal,
    });
  } catch {
    return NextResponse.json(
      {
        code: "bad_gateway:pdf",
        message: "Failed to fetch PDF from source.",
      },
      { status: 502 }
    );
  }

  if (!upstream.ok || !upstream.body) {
    if (upstream.status === 304) {
      const notModifiedHeaders = new Headers();
      const etag = upstream.headers.get("etag");
      if (etag) {
        notModifiedHeaders.set("ETag", etag);
      }
      const lastModified = upstream.headers.get("last-modified");
      if (lastModified) {
        notModifiedHeaders.set("Last-Modified", lastModified);
      }
      notModifiedHeaders.set("Cache-Control", "private, max-age=1800, stale-while-revalidate=86400");
      return new Response(null, {
        status: 304,
        headers: notModifiedHeaders,
      });
    }

    return NextResponse.json(
      {
        code: "bad_gateway:pdf",
        message: `Failed to fetch PDF (HTTP ${upstream.status}).`,
      },
      { status: 502 }
    );
  }

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  headers.set(
    "Content-Type",
    contentType?.toLowerCase().includes("pdf") ? contentType : "application/pdf"
  );

  const contentLength = upstream.headers.get("content-length");
  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }
  const contentRange = upstream.headers.get("content-range");
  if (contentRange) {
    headers.set("Content-Range", contentRange);
  }
  const acceptRanges = upstream.headers.get("accept-ranges");
  if (acceptRanges) {
    headers.set("Accept-Ranges", acceptRanges);
  }
  const etag = upstream.headers.get("etag");
  if (etag) {
    headers.set("ETag", etag);
  }
  const lastModified = upstream.headers.get("last-modified");
  if (lastModified) {
    headers.set("Last-Modified", lastModified);
  }

  headers.set("Content-Disposition", `inline; filename="${toSafeFilename(job.title)}"`);
  headers.set(
    "Cache-Control",
    isInternalCachedPdfUrl(pdfUrl)
      ? "private, max-age=86400, stale-while-revalidate=604800"
      : "private, max-age=1800, stale-while-revalidate=86400"
  );
  headers.set("Content-Security-Policy", "default-src 'self'; frame-ancestors 'self'");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
