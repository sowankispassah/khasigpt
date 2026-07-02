import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { TranslatePageClient } from "@/components/translate-page-client";
import {
  TRANSLATE_FEATURE_FLAG_KEY,
  TRANSLATE_PROVIDER_MODE_SETTING_KEY,
  TRANSLATE_TARGET_LANGUAGE_COOKIE_NAME,
} from "@/lib/constants";
import {
  getAppSetting,
  getLastKnownAppSetting,
  listTranslationFeatureLanguagesWithModels,
} from "@/lib/db/queries";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import { loadFeatureAccessSettingsByKeys } from "@/lib/settings/feature-access-settings";
import {
  parseTranslateAccessModeSetting,
  parseTranslateProviderModeSetting,
} from "@/lib/translate/config";
import { withTimeout } from "@/lib/utils/async";

const TRANSLATE_PAGE_QUERY_TIMEOUT_MS = 8_000;

export default async function TranslatePage() {
  const session = await auth();
  const cookieStore = await cookies();

  if (!session?.user) {
    redirect("/login?callbackUrl=/translate");
  }

  const [translateAccessSettings, translateProviderModeSetting, languageResult] =
    await Promise.all([
    loadFeatureAccessSettingsByKeys([TRANSLATE_FEATURE_FLAG_KEY], {
      source: "translate.page.feature-access",
      timeoutMs: TRANSLATE_PAGE_QUERY_TIMEOUT_MS,
    }),
    withTimeout(
      getAppSetting<string | boolean | number>(TRANSLATE_PROVIDER_MODE_SETTING_KEY),
      TRANSLATE_PAGE_QUERY_TIMEOUT_MS
    ).catch((error) => {
      console.error(
        "[translate/page] Failed to load translate provider mode.",
        error
      );
      return getLastKnownAppSetting<string | boolean | number>(
        TRANSLATE_PROVIDER_MODE_SETTING_KEY
      );
    }),
    withTimeout(
      listTranslationFeatureLanguagesWithModels(),
      TRANSLATE_PAGE_QUERY_TIMEOUT_MS
    ).then((languages) => ({
      languages,
      unavailable: false,
    })).catch((error) => {
      if (!(error instanceof Error && error.message === "timeout")) {
        console.error("[translate/page] Failed to load languages.", error);
      }
      return {
        languages: [],
        unavailable: true,
      };
    }),
  ]);

  const translateSetting =
    translateAccessSettings.values.get(TRANSLATE_FEATURE_FLAG_KEY) ??
    getLastKnownAppSetting<string | boolean>(TRANSLATE_FEATURE_FLAG_KEY);
  const translateAccessMode = parseTranslateAccessModeSetting(translateSetting);
  const translateSettingsUnavailable =
    translateAccessSettings.status === "unavailable" && translateSetting == null;
  const translateEnabled =
    translateSettingsUnavailable ||
    isFeatureEnabledForRole(translateAccessMode, session.user.role);
  const translateProviderMode = parseTranslateProviderModeSetting(
    translateProviderModeSetting
  );

  if (!translateEnabled) {
    notFound();
  }

  const activeLanguages = languageResult.languages
    .filter((language) => language.isActive)
    .map((language) => ({
      code: language.code,
      isDefault: language.isDefault,
      modelDisplayName: language.modelDisplayName ?? null,
      modelProvider: language.modelProvider ?? null,
      modelProviderModelId: language.modelProviderModelId ?? null,
      name: language.name,
    }));

  const preferredTargetLanguageCode =
    cookieStore.get(TRANSLATE_TARGET_LANGUAGE_COOKIE_NAME)?.value ?? null;
  const initialTargetLanguage =
    (preferredTargetLanguageCode
      ? activeLanguages.find(
          (language) => language.code === preferredTargetLanguageCode
        )
      : null) ??
    activeLanguages.find((language) => language.code === "en") ??
    activeLanguages.find((language) => language.isDefault) ??
    activeLanguages[0] ??
    null;

  return (
    <TranslatePageClient
      initialTargetLanguageCode={initialTargetLanguage?.code ?? ""}
      languagesUnavailable={languageResult.unavailable}
      languages={activeLanguages}
      providerMode={translateProviderMode}
      settingsUnavailable={translateSettingsUnavailable}
    />
  );
}
