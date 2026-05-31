import { NextResponse } from "next/server";
import { getJobsAccessForRole } from "@/lib/jobs/config";
import { renderPdfPreviewImage } from "@/lib/jobs/pdf-preview";
import { getJobPostingById } from "@/lib/jobs/service";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { verifyJobPreviewToken } from "@/lib/mobile-auth-token";

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
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const previewToken = searchParams.get("token")?.trim() ?? "";
  const hasValidPreviewToken = verifyJobPreviewToken(previewToken, id);

  if (!hasValidPreviewToken) {
    const session = await getMobileSession(request);
    if (!session?.user) {
      return NextResponse.json(
        { code: "unauthorized:auth", message: "You must be signed in." },
        { status: 401 }
      );
    }

    const jobsAccess = await getJobsAccessForRole(session.user.role ?? null);
    if (!jobsAccess.enabled) {
      return NextResponse.json(
        { code: "forbidden:auth", message: "Jobs access is disabled for your role." },
        { status: 403 }
      );
    }
  }

  const job = await getJobPostingById({
    id,
    includeInactive: false,
    includeRagState: false,
  });

  if (!job) {
    return NextResponse.json(
      { code: "not_found:job", message: "Job not found." },
      { status: 404 }
    );
  }

  const pdfUrl = resolvePdfUrl({
    content: job.content,
    pdfCachedUrl: job.pdfCachedUrl,
    pdfSourceUrl: job.pdfSourceUrl,
    sourceUrl: job.sourceUrl,
  });
  if (!pdfUrl) {
    return NextResponse.json(
      { code: "not_found:pdf", message: "No PDF available for this job." },
      { status: 404 }
    );
  }

  try {
    const preview = await renderPdfPreviewImage({
      headers: request.headers.get("cookie")
        ? { cookie: request.headers.get("cookie") as string }
        : undefined,
      pdfUrl,
      targetWidth: 960,
    });

    return new NextResponse(preview.pngBuffer, {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Type": "image/png",
      },
    });
  } catch (error) {
    console.warn("[api/mobile/jobs/[id]/preview-image] Failed to render PDF preview.", error);
    return NextResponse.json(
      { code: "bad_gateway:pdf_preview", message: "Failed to render PDF preview." },
      { status: 502 }
    );
  }
}
