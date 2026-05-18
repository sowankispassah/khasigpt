import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/api/cache";
import { withApiTiming } from "@/lib/api/observability";
import {
  loadCachedLanguageReadModel,
  loadLanguageReadModel,
} from "@/lib/api/read-models";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeLanguageCode(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const { searchParams } = new URL(request.url);
  const requestedLanguage = normalizeLanguageCode(searchParams.get("lang"));
  const preferredLanguage =
    requestedLanguage || normalizeLanguageCode(cookieStore.get("lang")?.value);

  if (!preferredLanguage) {
    return NextResponse.json(
      { code: "missing_language", message: "Language code is required." },
      { headers: noStoreHeaders(), status: 400 }
    );
  }

  let loadedFromCacheFallback = false;
  let languageSnapshot: Awaited<ReturnType<typeof loadLanguageReadModel>>;

  try {
    try {
      languageSnapshot = await withApiTiming(
        "mobile.i18n.fresh",
        () =>
          loadLanguageReadModel(preferredLanguage, {
            requireFresh: true,
          }),
        { slowMs: 750 }
      );
    } catch (freshError) {
      loadedFromCacheFallback = true;
      console.error("[api/mobile/i18n] Fresh language bundle failed; using cached bundle.", {
        error: freshError,
        language: preferredLanguage,
      });
      languageSnapshot = await withApiTiming(
        "mobile.i18n.cached_fallback",
        () => loadCachedLanguageReadModel(preferredLanguage),
        { slowMs: 500 }
      );
    }

    const activeLanguageCode = normalizeLanguageCode(
      languageSnapshot.i18n.activeLanguage.code
    );
    if (requestedLanguage && activeLanguageCode !== requestedLanguage) {
      return NextResponse.json(
        {
          code: "language_unavailable",
          message: "That language is not available right now.",
        },
        { headers: noStoreHeaders(), status: 404 }
      );
    }

    const response = NextResponse.json(
      {
        meta: {
          degraded: loadedFromCacheFallback,
          source: loadedFromCacheFallback ? "cached" : "fresh",
        },
        i18n: languageSnapshot.i18n,
        chatLanguages: languageSnapshot.chatLanguages,
      },
      { headers: noStoreHeaders() }
    );

    response.cookies.set("lang", languageSnapshot.i18n.activeLanguage.code, {
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });

    return response;
  } catch (error) {
    console.error("[api/mobile/i18n] Failed to load language bundle.", {
      error,
      language: preferredLanguage,
    });
    return NextResponse.json(
      {
        code: "language_load_failed",
        message: "Unable to load that language right now.",
      },
      { headers: noStoreHeaders(), status: 503 }
    );
  }
}
