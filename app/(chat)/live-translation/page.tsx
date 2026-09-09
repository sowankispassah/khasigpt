import { notFound, redirect } from "next/navigation";
import { LiveTranslationPageClient } from "@/components/live-translation-page-client";
import { LIVE_TRANSLATION_WEB_FEATURE_FLAG_KEY } from "@/lib/constants";
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
import { loadUserFeatureAccessOverride } from "@/lib/settings/user-feature-access";
import { getChatRouteSession } from "../chat-route-session";

const LIVE_TRANSLATION_PAGE_QUERY_TIMEOUT_MS = 5_000;

export default async function LiveTranslationPage() {
  const session = await getChatRouteSession();

  if (!session?.user) {
    redirect("/login?callbackUrl=/live-translation");
  }

  const [accessMode, settings, userOverride] = await Promise.all([
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
    loadUserFeatureAccessOverride({
      featureKey: LIVE_TRANSLATION_WEB_FEATURE_FLAG_KEY,
      source: "live-translation.page.user-feature-access",
      userId: session.user.id,
    }),
  ]);

  if (!isFeatureEnabledForRole(accessMode, session.user.role, userOverride)) {
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
