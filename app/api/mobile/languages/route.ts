import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/api/cache";
import { withApiTiming } from "@/lib/api/observability";
import {
  loadCachedLanguageReadModel,
  loadLanguageReadModel,
  loadTranslateReadModel,
} from "@/lib/api/read-models";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FALLBACK_LANGUAGE = {
  id: "fallback-en",
  code: "en",
  name: "English",
  displayName: "English",
  nativeName: "English",
  isDefault: true,
  isActive: true,
  syncUiLanguage: true,
};

const FALLBACK_TRANSLATE = {
  meta: {
    degraded: true,
    degradedSections: ["languages"],
  },
  providerMode: "ai",
  languages: [],
};

function buildFallbackLanguageSnapshot() {
  return {
    i18n: {
      activeLanguage: FALLBACK_LANGUAGE,
      languages: [FALLBACK_LANGUAGE],
      dictionary: {},
      dictionaryLanguageCode: "",
    },
    chatLanguages: [FALLBACK_LANGUAGE],
  };
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const { searchParams } = new URL(request.url);
  const requestedLanguage = searchParams.get("lang")?.trim().toLowerCase() ?? null;
  const preferredLanguage = requestedLanguage || cookieStore.get("lang")?.value || null;

  let languageDegraded = false;
  let translateDegraded = false;
  const [languageSnapshot, translate] = await Promise.all([
    withApiTiming("mobile.languages.chat", () =>
      loadLanguageReadModel(preferredLanguage)
    ).catch(async (error) => {
      console.error(
        "[api/mobile/languages] Chat language read failed; using cached/fallback languages.",
        error
      );
      languageDegraded = true;
      return loadCachedLanguageReadModel(preferredLanguage).catch(
        (cacheError) => {
          console.error(
            "[api/mobile/languages] Cached language fallback failed.",
            cacheError
          );
          return buildFallbackLanguageSnapshot();
        }
      );
    }),
    withApiTiming("mobile.languages.translate", () =>
      loadTranslateReadModel({ includeLanguages: true })
    ).catch((error) => {
      console.error(
        "[api/mobile/languages] Translate language read failed; returning chat languages only.",
        error
      );
      translateDegraded = true;
      return FALLBACK_TRANSLATE;
    }),
  ]);

  const response = NextResponse.json(
    {
      ...languageSnapshot,
      meta: {
        degraded: languageDegraded || translateDegraded,
        degradedSections: [
          languageDegraded ? "chatLanguages" : null,
          translateDegraded ? "translateLanguages" : null,
        ].filter((section): section is string => Boolean(section)),
      },
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
