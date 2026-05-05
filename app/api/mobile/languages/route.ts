import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/api/cache";
import { withApiTiming } from "@/lib/api/observability";
import { loadLanguageReadModel, loadTranslateReadModel } from "@/lib/api/read-models";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const { searchParams } = new URL(request.url);
  const requestedLanguage = searchParams.get("lang")?.trim().toLowerCase() ?? null;
  const preferredLanguage = requestedLanguage || cookieStore.get("lang")?.value || null;

  const [languageSnapshot, translate] = await Promise.all([
    withApiTiming("mobile.languages.chat", () =>
      loadLanguageReadModel(preferredLanguage)
    ),
    withApiTiming("mobile.languages.translate", () =>
      loadTranslateReadModel({ includeLanguages: true })
    ),
  ]);

  const response = NextResponse.json(
    {
      ...languageSnapshot,
      translate,
    },
    { headers: noStoreHeaders() }
  );

  if (requestedLanguage) {
    response.cookies.set("lang", languageSnapshot.i18n.activeLanguage.code, {
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });
  }

  return response;
}
