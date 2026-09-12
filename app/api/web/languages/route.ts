import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CACHE_CONTROL, cacheHeaders } from "@/lib/api/cache";
import { withApiTiming } from "@/lib/api/observability";
import { loadLanguageReadModel } from "@/lib/api/read-models";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const { searchParams } = new URL(request.url);
  const requestedLanguage = searchParams.get("lang")?.trim().toLowerCase() ?? null;
  const preferredLanguage = requestedLanguage || cookieStore.get("lang")?.value || null;
  const languageSnapshot = await withApiTiming("web.languages", () =>
    loadLanguageReadModel(preferredLanguage)
  );

  return NextResponse.json(languageSnapshot, {
    headers: cacheHeaders(CACHE_CONTROL.privateMedium),
  });
}
