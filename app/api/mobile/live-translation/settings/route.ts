import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { getAppSetting, getLastKnownAppSetting } from "@/lib/db/queries";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import {
  DEFAULT_LIVE_TRANSLATION_LANGUAGE_A,
  DEFAULT_LIVE_TRANSLATION_LANGUAGE_B,
  getLiveTranslationAccessModeForPlatform,
  LIVE_TRANSLATION_ACCESS_MODE_FALLBACK,
  LIVE_TRANSLATION_DEFAULT_LANGUAGE_A_SETTING_KEY,
  LIVE_TRANSLATION_DEFAULT_LANGUAGE_B_SETTING_KEY,
  LIVE_TRANSLATION_SUPPORTED_LANGUAGES_SETTING_KEY,
  normalizeLiveTranslationLanguages,
  resolveLiveTranslationLanguageCode,
} from "@/lib/live-translation/config";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIVE_TRANSLATION_SETTINGS_TIMEOUT_MS = 5_000;

async function safeLiveTranslationSetting<T>(key: string) {
  try {
    return await withTimeout(
      getAppSetting<T>(key),
      LIVE_TRANSLATION_SETTINGS_TIMEOUT_MS
    );
  } catch (error) {
    console.error(
      `[api/mobile/live-translation/settings] Failed to load setting "${key}".`,
      error
    );
    return getLastKnownAppSetting<T>(key);
  }
}

export async function GET(request: Request) {
  const authContext = await getAuthenticatedUser(request, {
    allowCookie: false,
  });

  if (!authContext?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const [accessMode, languagesValue, defaultLanguageA, defaultLanguageB] =
    await Promise.all([
      getLiveTranslationAccessModeForPlatform("android").catch((error) => {
        console.error(
          "[api/mobile/live-translation/settings] Feature setting read failed.",
          error
        );
        return LIVE_TRANSLATION_ACCESS_MODE_FALLBACK;
      }),
      safeLiveTranslationSetting<unknown>(
        LIVE_TRANSLATION_SUPPORTED_LANGUAGES_SETTING_KEY
      ),
      safeLiveTranslationSetting<string>(
        LIVE_TRANSLATION_DEFAULT_LANGUAGE_A_SETTING_KEY
      ),
      safeLiveTranslationSetting<string>(
        LIVE_TRANSLATION_DEFAULT_LANGUAGE_B_SETTING_KEY
      ),
    ]);

  if (!isFeatureEnabledForRole(accessMode, authContext.user.role)) {
    return NextResponse.json(
      { message: "Not found" },
      { headers: noStoreHeaders(), status: 404 }
    );
  }

  const languages = normalizeLiveTranslationLanguages(languagesValue);

  return NextResponse.json(
    {
      defaultLanguageACode: resolveLiveTranslationLanguageCode({
        fallback: DEFAULT_LIVE_TRANSLATION_LANGUAGE_A,
        languages,
        value: defaultLanguageA,
      }),
      defaultLanguageBCode: resolveLiveTranslationLanguageCode({
        fallback: DEFAULT_LIVE_TRANSLATION_LANGUAGE_B,
        languages,
        value: defaultLanguageB,
      }),
      languages,
      meta: {
        degraded: !languagesValue,
      },
    },
    { headers: noStoreHeaders() }
  );
}
