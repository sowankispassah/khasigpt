import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { LiveTranslationPageClient } from "@/components/live-translation-page-client";
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

const LIVE_TRANSLATION_PAGE_QUERY_TIMEOUT_MS = 5_000;

export default async function LiveTranslationPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/live-translation");
  }

  const [accessMode, settings] = await Promise.all([
    getLiveTranslationAccessModeForPlatform("web").catch((error) => {
      console.error(
        "[live-translation/page] Feature setting read failed.",
        error
      );
      return LIVE_TRANSLATION_ACCESS_MODE_FALLBACK;
    }),
    loadLiveTranslationSettingsValues({
      source: "live-translation/page",
      timeoutMs: LIVE_TRANSLATION_PAGE_QUERY_TIMEOUT_MS,
    }),
  ]);

  if (!isFeatureEnabledForRole(accessMode, session.user.role)) {
    notFound();
  }

  const languages = normalizeLiveTranslationLanguages(settings.languagesValue);
  const defaultLanguageACode = resolveLiveTranslationLanguageCode({
    fallback: DEFAULT_LIVE_TRANSLATION_LANGUAGE_A,
    languages,
    value: settings.defaultLanguageA,
  });
  const defaultLanguageBCode = resolveLiveTranslationLanguageCode({
    fallback: DEFAULT_LIVE_TRANSLATION_LANGUAGE_B,
    languages,
    value: settings.defaultLanguageB,
  });

  return (
    <LiveTranslationPageClient
      defaultLanguageACode={defaultLanguageACode}
      defaultLanguageBCode={defaultLanguageBCode}
      languages={languages}
      settingsUnavailable={
        !settings.languagesValue ||
        settings.degradedKeys.includes(
          LIVE_TRANSLATION_SUPPORTED_LANGUAGES_SETTING_KEY
        )
      }
    />
  );
}
