import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const updateJobPayloadSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(500),
  company: z.string().trim().min(1, "Company is required.").max(500),
  location: z.string().trim().min(1, "Location is required.").max(500),
  description: z.string().max(200_000).default(""),
  status: z.enum(["active", "inactive"]).default("active"),
  sourceUrl: z.string().max(2_000).optional().nullable(),
  pdfSourceUrl: z.string().max(2_000).optional().nullable(),
  pdfCachedUrl: z.string().max(2_000).optional().nullable(),
});

function normalizeOptionalString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export async function PATCH(
  request: NextRequest,
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
  if (session.user.role !== "admin") {
    return NextResponse.json(
      {
        code: "forbidden:auth",
        message: "Admin access required.",
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

  let payload: z.infer<typeof updateJobPayloadSchema>;
  try {
    payload = updateJobPayloadSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      {
        code: "bad_request:validation",
        message: "Invalid request payload.",
      },
      { status: 400 }
    );
  }

  const supabase = createSupabaseAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("jobs")
    .select("id, source_url")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      {
        code: "bad_request:database",
        message: "Failed to load existing job.",
      },
      { status: 400 }
    );
  }

  if (!existing) {
    return NextResponse.json(
      {
        code: "not_found:job",
        message: "Job not found.",
      },
      { status: 404 }
    );
  }

  const nextSourceUrl =
    normalizeOptionalString(payload.sourceUrl) ??
    normalizeOptionalString(existing.source_url) ??
    "";
  if (!nextSourceUrl) {
    return NextResponse.json(
      {
        code: "bad_request:validation",
        message: "Source URL cannot be empty.",
      },
      { status: 400 }
    );
  }

  const updatePayload = {
    title: payload.title.trim(),
    company: payload.company.trim(),
    location: payload.location.trim(),
    description: payload.description.trim(),
    status: payload.status,
    source_url: nextSourceUrl,
    pdf_source_url: normalizeOptionalString(payload.pdfSourceUrl),
    pdf_cached_url: normalizeOptionalString(payload.pdfCachedUrl),
  };

  const { error: updateError } = await supabase
    .from("jobs")
    .update(updatePayload)
    .eq("id", id);

  if (updateError) {
    const isDuplicateSource =
      updateError.code === "23505" || /source_url|duplicate|unique/i.test(updateError.message);
    return NextResponse.json(
      {
        code: isDuplicateSource ? "bad_request:duplicate_source_url" : "bad_request:database",
        message: isDuplicateSource
          ? "Another job already uses this source URL."
          : "Failed to update job.",
      },
      { status: isDuplicateSource ? 409 : 400 }
    );
  }

  return NextResponse.json({
    ok: true,
  });
}

