import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import {
  DEFAULT_LIVE_TRANSLATION_LANGUAGE_A,
  DEFAULT_LIVE_TRANSLATION_LANGUAGE_B,
  getLiveTranslationAccessModeForPlatform,
  LIVE_TRANSLATION_ACCESS_MODE_FALLBACK,
  LIVE_TRANSLATION_SUPPORTED_LANGUAGES_SETTING_KEY,
  normalizeLiveTranslationLanguages,
  resolveLiveTranslationLanguageCode,
} from "@/lib/live-translation/config";
import { loadLiveTranslationSettingsValues } from "@/lib/live-translation/settings-read";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIVE_TRANSLATION_SETTINGS_TIMEOUT_MS = 5_000;

export async function GET(request: Request) {
  const authContext = await getAuthenticatedUser(request, {
    allowCookie: false,
  });

  if (!authContext?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const [accessMode, settings] = await Promise.all([
    getLiveTranslationAccessModeForPlatform("android").catch((error) => {
      console.error(
        "[api/mobile/live-translation/settings] Feature setting read failed.",
        error
      );
      return LIVE_TRANSLATION_ACCESS_MODE_FALLBACK;
    }),
    loadLiveTranslationSettingsValues({
      source: "api/mobile/live-translation/settings",
      timeoutMs: LIVE_TRANSLATION_SETTINGS_TIMEOUT_MS,
    }),
  ]);

  if (!isFeatureEnabledForRole(accessMode, authContext.user.role)) {
    return NextResponse.json(
      { message: "Not found" },
      { headers: noStoreHeaders(), status: 404 }
    );
  }

  const languages = normalizeLiveTranslationLanguages(settings.languagesValue);

  return NextResponse.json(
    {
      defaultLanguageACode: resolveLiveTranslationLanguageCode({
        fallback: DEFAULT_LIVE_TRANSLATION_LANGUAGE_A,
        languages,
        value: settings.defaultLanguageA,
      }),
      defaultLanguageBCode: resolveLiveTranslationLanguageCode({
        fallback: DEFAULT_LIVE_TRANSLATION_LANGUAGE_B,
        languages,
        value: settings.defaultLanguageB,
      }),
      languages,
      meta: {
        degraded:
          !settings.languagesValue ||
          settings.degradedKeys.includes(
            LIVE_TRANSLATION_SUPPORTED_LANGUAGES_SETTING_KEY
          ),
      },
    },
    { headers: noStoreHeaders() }
  );
}
