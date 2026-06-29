import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { LiveTranslationPageClient } from "@/components/live-translation-page-client";
import { getAppSetting, getLastKnownAppSetting } from "@/lib/db/queries";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import {
  DEFAULT_LIVE_TRANSLATION_LANGUAGE_A,
  DEFAULT_LIVE_TRANSLATION_LANGUAGE_B,
  getLiveTranslationAccessModeForPlatform,
  LIVE_TRANSLATION_DEFAULT_LANGUAGE_A_SETTING_KEY,
  LIVE_TRANSLATION_DEFAULT_LANGUAGE_B_SETTING_KEY,
  LIVE_TRANSLATION_SUPPORTED_LANGUAGES_SETTING_KEY,
  normalizeLiveTranslationLanguages,
  resolveLiveTranslationLanguageCode,
} from "@/lib/live-translation/config";
import { withTimeout } from "@/lib/utils/async";

const LIVE_TRANSLATION_PAGE_QUERY_TIMEOUT_MS = 5_000;

async function safeLiveTranslationSetting<T>(key: string) {
  try {
    return await withTimeout(
      getAppSetting<T>(key),
      LIVE_TRANSLATION_PAGE_QUERY_TIMEOUT_MS
    );
  } catch (error) {
    console.error(`[live-translation/page] Failed to load setting "${key}".`, error);
    return getLastKnownAppSetting<T>(key);
  }
}

export default async function LiveTranslationPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/live-translation");
  }

  const [accessMode, languagesValue, defaultLanguageA, defaultLanguageB] =
    await Promise.all([
      getLiveTranslationAccessModeForPlatform("web").catch((error) => {
        console.error(
          "[live-translation/page] Feature setting read failed.",
          error
        );
        return "enabled" as const;
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

  if (!isFeatureEnabledForRole(accessMode, session.user.role)) {
    notFound();
  }

  const languages = normalizeLiveTranslationLanguages(languagesValue);
  const defaultLanguageACode = resolveLiveTranslationLanguageCode({
    fallback: DEFAULT_LIVE_TRANSLATION_LANGUAGE_A,
    languages,
    value: defaultLanguageA,
  });
  const defaultLanguageBCode = resolveLiveTranslationLanguageCode({
    fallback: DEFAULT_LIVE_TRANSLATION_LANGUAGE_B,
    languages,
    value: defaultLanguageB,
  });

  return (
    <LiveTranslationPageClient
      defaultLanguageACode={defaultLanguageACode}
      defaultLanguageBCode={defaultLanguageBCode}
      languages={languages}
      settingsUnavailable={!languagesValue}
    />
  );
}
