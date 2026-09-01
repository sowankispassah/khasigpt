import { unstable_cache } from "next/cache";
import type { ComponentProps, ReactNode } from "react";
import {
  createLanguageAction,
  createTranslationFeatureLanguageAction,
  deleteLanguageAction,
  deleteTranslationFeatureLanguageAction,
  updateAboutContentAction,
  updateComingSoonContentAction,
  updateComingSoonTimerAction,
  updateFreeMessageSettingsAction,
  updateIconPromptsAction,
  updateImageFilenamePrefixAction,
  updateLanguageSettingsAction,
  updateLanguageStatusAction,
  updateLiveTranslationSettingsAction,
  updatePrivacyPolicyByLanguageAction,
  updateSuggestedPromptsAction,
  updateTermsOfServiceByLanguageAction,
  updateTranslateProviderModeAction,
  updateTranslationFeatureLanguageSettingsAction,
  updateTranslationFeatureLanguageStatusAction,
} from "@/app/(admin)/actions";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { EditableTranslation } from "@/components/translation-edit-provider";
import {
  ADMIN_SETTINGS_LANGUAGES_CACHE_TAG,
  ADMIN_SETTINGS_MODELS_CACHE_TAG,
  ADMIN_SETTINGS_TRANSLATION_FEATURE_LANGUAGES_CACHE_TAG,
} from "@/lib/admin/cache-invalidation";
import {
  resolveAdminDbReadGroup,
  shouldSerializeAdminDbReads,
} from "@/lib/admin/db-read-concurrency";
import { getAdminQueryTimeoutMs } from "@/lib/admin/safe-query";
import { MODEL_REGISTRY_CACHE_TAG } from "@/lib/ai/model-registry";
import {
  CALCULATOR_FEATURE_FLAG_KEY,
  DEFAULT_ABOUT_US,
  DEFAULT_PRIVACY_POLICY,
  DEFAULT_SUGGESTED_PROMPTS,
  DEFAULT_TERMS_OF_SERVICE,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  EXPLORE_MEGHALAYA_FEATURE_FLAG_KEY,
  FREE_MESSAGE_SETTINGS_KEY,
  ICON_PROMPTS_ENABLED_SETTING_KEY,
  ICON_PROMPTS_SETTING_KEY,
  IMAGE_GENERATION_FEATURE_FLAG_KEY,
  IMAGE_GENERATION_FILENAME_PREFIX_SETTING_KEY,
  JOBS_FEATURE_FLAG_KEY,
  LIVE_TRANSLATION_ANDROID_FEATURE_FLAG_KEY,
  LIVE_TRANSLATION_DEFAULT_LANGUAGE_A_SETTING_KEY,
  LIVE_TRANSLATION_DEFAULT_LANGUAGE_B_SETTING_KEY,
  LIVE_TRANSLATION_SUPPORTED_LANGUAGES_SETTING_KEY,
  LIVE_TRANSLATION_SYSTEM_INSTRUCTION_SETTING_KEY,
  LIVE_TRANSLATION_WEB_FEATURE_FLAG_KEY,
  NEWS_FEATURE_FLAG_KEY,
  SITE_ADMIN_ENTRY_CODE_HASH_SETTING_KEY,
  SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY,
  SITE_ADMIN_ENTRY_PATH_SETTING_KEY,
  SITE_COMING_SOON_CONTENT_SETTING_KEY,
  SITE_COMING_SOON_TIMER_SETTING_KEY,
  SITE_LEGACY_LAUNCH_MODE_SETTING_KEY,
  SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY,
  SITE_PUBLIC_LAUNCHED_SETTING_KEY,
  SITE_UNDER_MAINTENANCE_SETTING_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
  SUGGESTED_PROMPTS_ENABLED_SETTING_KEY,
  TRANSLATE_FEATURE_FLAG_KEY,
  TRANSLATE_PROVIDER_MODE_SETTING_KEY,
  VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY,
  VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY,
  VOICE_CHAT_WEB_FEATURE_FLAG_KEY,
  WEB_SEARCH_CREDIT_MULTIPLIER_SETTING_KEY,
  WEB_SEARCH_ENABLED_NATIVE_SETTING_KEY,
  WEB_SEARCH_ENABLED_SETTING_KEY,
  WEB_SEARCH_ENABLED_WEB_SETTING_KEY,
  WEB_SEARCH_FALLBACK_PROVIDER_SETTING_KEY,
  WEB_SEARCH_FREE_USERS_ENABLED_SETTING_KEY,
  WEB_SEARCH_MAX_CALLS_SETTING_KEY,
  WEB_SEARCH_PAID_USERS_ENABLED_SETTING_KEY,
  WEB_SEARCH_PROVIDER_SETTING_KEY,
} from "@/lib/constants";
import {
  getAppSettingsByKeys,
  getLastKnownAppSettingsByKeys,
  listLanguagesWithSettings,
  listModelConfigs,
  listTranslationFeatureLanguages,
} from "@/lib/db/queries";
import { normalizeFreeMessageSettings } from "@/lib/free-messages";
import {
  normalizeIconPromptSettings,
} from "@/lib/icon-prompts";
import {
  DEFAULT_LIVE_TRANSLATION_LANGUAGE_A,
  DEFAULT_LIVE_TRANSLATION_LANGUAGE_B,
  DEFAULT_LIVE_TRANSLATION_SYSTEM_INSTRUCTION,
  normalizeLiveTranslationLanguages,
  resolveLiveTranslationLanguageCode,
  serializeLiveTranslationLanguagesText,
} from "@/lib/live-translation/config";
import {
  DEFAULT_ADMIN_ENTRY_PATH,
  normalizeAdminEntryPathSetting,
} from "@/lib/settings/admin-entry";
import { parseBooleanSetting } from "@/lib/settings/boolean-setting";
import {
  normalizeComingSoonContentSetting,
  normalizeComingSoonTimerSetting,
} from "@/lib/settings/coming-soon";
import {
  ADMIN_FEATURE_ACCESS_SETTINGS,
  buildFeatureAccessSnapshotFromValues,
  loadFeatureAccessSettingsByKeys,
  resolveFeatureAccessControlState,
} from "@/lib/settings/feature-access-settings";
import {
  parseLegacySiteLaunchMode,
  resolveAdminAccessEnabledSetting,
  resolvePublicLaunchedSetting,
} from "@/lib/settings/site-launch";
import {
  parseTranslateProviderModeSetting,
} from "@/lib/translate/config";
import { isGoogleLiveTranslationModel } from "@/lib/translate/live";
import { withTimeout } from "@/lib/utils/async";
import { resolveWebSearchConfig } from "@/lib/web-search/config";
import { FeatureAccessModeControl } from "./feature-access-mode-control";
import { IconPromptSettingsForm } from "./icon-prompt-settings-form";
import { LanguageContentForm } from "./language-content-form";
import { LanguagePromptsForm } from "./language-prompts-form";
import { AdminSettingsNotice } from "./notice";
import { PrelaunchInvitesPanel } from "./prelaunch-invites-panel";
import { SiteAccessSettingsPanel } from "./site-access-settings-panel";
import { WebSearchSettingsForm } from "./web-search-settings-form";

export const dynamic = "force-dynamic";

const SETTINGS_PENDING_TIMEOUT_MS = 5000;
const ADMIN_SETTINGS_SECTION_QUERY_TIMEOUT_MS = getAdminQueryTimeoutMs(3500);
const ADMIN_SETTINGS_SNAPSHOT_QUERY_TIMEOUT_MS = getAdminQueryTimeoutMs(6000);
const ADMIN_SETTINGS_LIST_CACHE_REVALIDATE_SECONDS = 300;
const SETTINGS_SNAPSHOT_KEYS = [
  "privacyPolicy",
  "termsOfService",
  "aboutUsContent",
  "aboutUsContentByLanguage",
  "privacyPolicyByLanguage",
  "termsOfServiceByLanguage",
  "suggestedPrompts",
  "suggestedPromptsByLanguage",
  SUGGESTED_PROMPTS_ENABLED_SETTING_KEY,
  SITE_COMING_SOON_CONTENT_SETTING_KEY,
  SITE_COMING_SOON_TIMER_SETTING_KEY,
  SITE_PUBLIC_LAUNCHED_SETTING_KEY,
  SITE_UNDER_MAINTENANCE_SETTING_KEY,
  SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY,
  SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY,
  SITE_ADMIN_ENTRY_CODE_HASH_SETTING_KEY,
  SITE_ADMIN_ENTRY_PATH_SETTING_KEY,
  SITE_LEGACY_LAUNCH_MODE_SETTING_KEY,
  CALCULATOR_FEATURE_FLAG_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
  TRANSLATE_FEATURE_FLAG_KEY,
  TRANSLATE_PROVIDER_MODE_SETTING_KEY,
  LIVE_TRANSLATION_ANDROID_FEATURE_FLAG_KEY,
  LIVE_TRANSLATION_WEB_FEATURE_FLAG_KEY,
  LIVE_TRANSLATION_SUPPORTED_LANGUAGES_SETTING_KEY,
  LIVE_TRANSLATION_DEFAULT_LANGUAGE_A_SETTING_KEY,
  LIVE_TRANSLATION_DEFAULT_LANGUAGE_B_SETTING_KEY,
  LIVE_TRANSLATION_SYSTEM_INSTRUCTION_SETTING_KEY,
  JOBS_FEATURE_FLAG_KEY,
  NEWS_FEATURE_FLAG_KEY,
  IMAGE_GENERATION_FEATURE_FLAG_KEY,
  IMAGE_GENERATION_FILENAME_PREFIX_SETTING_KEY,
  ICON_PROMPTS_SETTING_KEY,
  ICON_PROMPTS_ENABLED_SETTING_KEY,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  EXPLORE_MEGHALAYA_FEATURE_FLAG_KEY,
  FREE_MESSAGE_SETTINGS_KEY,
  WEB_SEARCH_PROVIDER_SETTING_KEY,
  WEB_SEARCH_FALLBACK_PROVIDER_SETTING_KEY,
  WEB_SEARCH_ENABLED_WEB_SETTING_KEY,
  WEB_SEARCH_ENABLED_NATIVE_SETTING_KEY,
  WEB_SEARCH_FREE_USERS_ENABLED_SETTING_KEY,
  WEB_SEARCH_PAID_USERS_ENABLED_SETTING_KEY,
  WEB_SEARCH_MAX_CALLS_SETTING_KEY,
  WEB_SEARCH_CREDIT_MULTIPLIER_SETTING_KEY,
] as const;
const ESSENTIAL_FALLBACK_SETTING_KEYS = [
  SITE_PUBLIC_LAUNCHED_SETTING_KEY,
  SITE_UNDER_MAINTENANCE_SETTING_KEY,
  SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY,
  SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY,
  SITE_ADMIN_ENTRY_CODE_HASH_SETTING_KEY,
  SITE_ADMIN_ENTRY_PATH_SETTING_KEY,
  SITE_LEGACY_LAUNCH_MODE_SETTING_KEY,
  SITE_COMING_SOON_CONTENT_SETTING_KEY,
  SITE_COMING_SOON_TIMER_SETTING_KEY,
  CALCULATOR_FEATURE_FLAG_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
  TRANSLATE_FEATURE_FLAG_KEY,
  LIVE_TRANSLATION_ANDROID_FEATURE_FLAG_KEY,
  LIVE_TRANSLATION_WEB_FEATURE_FLAG_KEY,
  JOBS_FEATURE_FLAG_KEY,
  IMAGE_GENERATION_FEATURE_FLAG_KEY,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  SUGGESTED_PROMPTS_ENABLED_SETTING_KEY,
  ICON_PROMPTS_ENABLED_SETTING_KEY,
] as const;
const ADMIN_FEATURE_ACCESS_SETTING_KEYS = Array.from(
  new Set([
    ...ADMIN_FEATURE_ACCESS_SETTINGS.map((setting) => setting.settingKey),
    VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY,
  ])
);
const ESSENTIAL_SETTING_KEY_SET = new Set<string>(
  ESSENTIAL_FALLBACK_SETTING_KEYS
);
const NON_ESSENTIAL_SETTINGS_SNAPSHOT_KEYS = SETTINGS_SNAPSHOT_KEYS.filter(
  (key) => !ESSENTIAL_SETTING_KEY_SET.has(key)
);
const listAdminModelConfigsCached = unstable_cache(
  () =>
    listModelConfigs({
      includeDisabled: true,
      includeDeleted: true,
      limit: 200,
    }),
  ["admin-settings:model-configs:v1"],
  {
    revalidate: ADMIN_SETTINGS_LIST_CACHE_REVALIDATE_SECONDS,
    tags: [ADMIN_SETTINGS_MODELS_CACHE_TAG, MODEL_REGISTRY_CACHE_TAG],
  }
);
const listAdminLanguagesCached = unstable_cache(
  () => listLanguagesWithSettings(),
  ["admin-settings:languages:v1"],
  {
    revalidate: ADMIN_SETTINGS_LIST_CACHE_REVALIDATE_SECONDS,
    tags: [ADMIN_SETTINGS_LANGUAGES_CACHE_TAG, "languages"],
  }
);
const listAdminTranslationFeatureLanguagesCached = unstable_cache(
  () => listTranslationFeatureLanguages(),
  ["admin-settings:translation-feature-languages:v1"],
  {
    revalidate: ADMIN_SETTINGS_LIST_CACHE_REVALIDATE_SECONDS,
    tags: [ADMIN_SETTINGS_TRANSLATION_FEATURE_LANGUAGES_CACHE_TAG],
  }
);

async function settingsQueryState<T>(
  label: string,
  query: () => Promise<T>,
  fallbackValue: T,
  timeoutMs = ADMIN_SETTINGS_SECTION_QUERY_TIMEOUT_MS
): Promise<{ failed: boolean; value: T }> {
  const startedAt = Date.now();
  try {
    const value = await withTimeout(query(), timeoutMs, () => {
      console.error(`[admin/settings] ${label} query timed out.`, {
        durationMs: Date.now() - startedAt,
        timeoutMs,
      });
    });
    console.info(`[admin/settings] ${label} query completed.`, {
      durationMs: Date.now() - startedAt,
    });
    return { failed: false, value };
  } catch (error) {
    console.error(
      `[admin/settings] ${label} query failed. Keeping the section degraded instead of treating fallback data as confirmed.`,
      { durationMs: Date.now() - startedAt, error }
    );
    return { failed: true, value: fallbackValue };
  }
}

async function loadEssentialFallbackSettingMap() {
  const settings = await withTimeout(
    getAppSettingsByKeys([...ESSENTIAL_FALLBACK_SETTING_KEYS]),
    ADMIN_SETTINGS_SNAPSHOT_QUERY_TIMEOUT_MS,
    () => {
      console.error("[admin/settings] Essential setting fallback timed out.", {
        timeoutMs: ADMIN_SETTINGS_SNAPSHOT_QUERY_TIMEOUT_MS,
      });
    }
  );

  const map = new Map<string, unknown>();
  for (const setting of settings) {
    const key = setting.key;
    const value = setting.value;
    if (value !== null && value !== undefined) {
      map.set(key, value);
    }
  }
  return map;
}

type AppSettingReadSource = "snapshot-db" | "essential-db" | "last-known";

async function loadAppSettingValuesByKey(): Promise<{
  source: AppSettingReadSource;
  values: Map<string, unknown>;
}> {
  const essentialSettingsPromise = withTimeout(
    getAppSettingsByKeys([...ESSENTIAL_FALLBACK_SETTING_KEYS]),
    ADMIN_SETTINGS_SNAPSHOT_QUERY_TIMEOUT_MS,
    () => {
      console.error("[admin/settings] Essential app settings timed out.", {
        timeoutMs: ADMIN_SETTINGS_SNAPSHOT_QUERY_TIMEOUT_MS,
      });
    }
  ).catch((error) => {
    console.error(
      "[admin/settings] Essential app settings query failed. Retrying with last known values.",
      error
    );
    return null;
  });

  try {
    const settings = await withTimeout(
      getAppSettingsByKeys([...SETTINGS_SNAPSHOT_KEYS]),
      ADMIN_SETTINGS_SNAPSHOT_QUERY_TIMEOUT_MS,
      () => {
        console.error("[admin/settings] App settings snapshot timed out.", {
          timeoutMs: ADMIN_SETTINGS_SNAPSHOT_QUERY_TIMEOUT_MS,
        });
      }
    );
    return {
      source: "snapshot-db",
      values: new Map(settings.map((setting) => [setting.key, setting.value])),
    };
  } catch (error) {
    console.error(
      "[admin/settings] App settings snapshot failed. Retrying essential settings with last-known optional values.",
      error
    );
  }

  const essentialSettings = await essentialSettingsPromise;
  if (essentialSettings) {
    const values = new Map(
      essentialSettings.map((setting) => [setting.key, setting.value])
    );
    const lastKnownOptionalValues = getLastKnownAppSettingsByKeys([
      ...NON_ESSENTIAL_SETTINGS_SNAPSHOT_KEYS,
    ]);
    for (const [key, value] of lastKnownOptionalValues) {
      values.set(key, value);
    }
    return {
      source: "essential-db",
      values,
    };
  }

  return {
    source: "last-known",
    values: getLastKnownAppSettingsByKeys([...SETTINGS_SNAPSHOT_KEYS]),
  };
}

async function loadAdminFeatureAccessState() {
  const liteSnapshot = await loadFeatureAccessSettingsByKeys(
    [...ADMIN_FEATURE_ACCESS_SETTING_KEYS],
    {
      source: "admin.settings.feature-access",
      timeoutMs: ADMIN_SETTINGS_SNAPSHOT_QUERY_TIMEOUT_MS,
    }
  );
  if (liteSnapshot.status === "confirmed") {
    return liteSnapshot;
  }

  try {
    const rows = await withTimeout(
      getAppSettingsByKeys([...ADMIN_FEATURE_ACCESS_SETTING_KEYS]),
      ADMIN_SETTINGS_SNAPSHOT_QUERY_TIMEOUT_MS,
      () => {
        console.error(
          "[admin/settings] Main feature access settings query timed out.",
          {
            timeoutMs: ADMIN_SETTINGS_SNAPSHOT_QUERY_TIMEOUT_MS,
          }
        );
      }
    );
    return buildFeatureAccessSnapshotFromValues({
      source: "admin.settings.feature-access:main-db",
      status: "confirmed",
      values: new Map(rows.map((row) => [row.key, row.value])),
    });
  } catch (error) {
    console.error(
      "[admin/settings] Main feature access settings query failed.",
      error
    );
    return liteSnapshot;
  }
}

function SettingsSubmitButton(
  props: ComponentProps<typeof ActionSubmitButton>
) {
  return (
    <ActionSubmitButton
      pendingTimeoutMs={SETTINGS_PENDING_TIMEOUT_MS}
      {...props}
    />
  );
}

async function loadAdminSettingsData() {
  const serializeDbReads = shouldSerializeAdminDbReads();
  const dedicatedFeatureAccessStatePromise = loadAdminFeatureAccessState();
  const appSettingStatePromise = serializeDbReads
    ? dedicatedFeatureAccessStatePromise.then(() => loadAppSettingValuesByKey())
    : loadAppSettingValuesByKey();
  const [dedicatedFeatureAccessState, appSettingState] = await Promise.all([
    dedicatedFeatureAccessStatePromise,
    appSettingStatePromise,
  ]);
  const [
    modelsState,
    languagesState,
    translationFeatureLanguagesState,
  ] = await resolveAdminDbReadGroup([
    () =>
      settingsQueryState(
        "model configs",
        () => listAdminModelConfigsCached(),
        []
      ),
    () =>
      settingsQueryState("languages", () => listAdminLanguagesCached(), []),
    () =>
      settingsQueryState(
        "translation feature languages",
        () => listAdminTranslationFeatureLanguagesCached(),
        []
      ),
  ]);
  const appSettingValuesByKey = appSettingState.values;
  const dbBackedAppSettingValues =
    appSettingState.source === "snapshot-db" ||
    appSettingState.source === "essential-db";
  const featureAccessValues = new Map(
    ADMIN_FEATURE_ACCESS_SETTING_KEYS.flatMap((key) =>
      appSettingValuesByKey.has(key)
        ? ([[key, appSettingValuesByKey.get(key)]] as [string, unknown][])
        : []
    )
  );
  const resolvedFeatureAccessState = buildFeatureAccessSnapshotFromValues({
    source: `${appSettingState.source}:feature-access`,
    status: dbBackedAppSettingValues
      ? "confirmed"
      : featureAccessValues.size > 0
        ? "stale"
        : "unavailable",
    values: featureAccessValues,
  });
  const featureAccessState =
    dedicatedFeatureAccessState.status === "confirmed"
      ? dedicatedFeatureAccessState
      : resolvedFeatureAccessState.status === "confirmed"
        ? resolvedFeatureAccessState
        : dedicatedFeatureAccessState;
  const getStoredSetting = <T,>(key: string): T | null => {
    const value = appSettingValuesByKey.get(key);
    return value === undefined ? null : (value as T);
  };

  const privacyPolicySetting = getStoredSetting<string>("privacyPolicy");
  const termsOfServiceSetting = getStoredSetting<string>("termsOfService");
  const aboutUsSetting = getStoredSetting<string>("aboutUsContent");
  const aboutUsContentByLanguageSetting = getStoredSetting<
    Record<string, string>
  >("aboutUsContentByLanguage");
  const privacyPolicyByLanguageSetting = getStoredSetting<
    Record<string, string>
  >("privacyPolicyByLanguage");
  const termsOfServiceByLanguageSetting = getStoredSetting<
    Record<string, string>
  >("termsOfServiceByLanguage");
  const suggestedPromptsSetting =
    getStoredSetting<string[]>("suggestedPrompts");
  const suggestedPromptsByLanguageSetting = getStoredSetting<
    Record<string, string[]>
  >("suggestedPromptsByLanguage");
  const sitePublicLaunchedSetting = getStoredSetting<string | boolean>(
    SITE_PUBLIC_LAUNCHED_SETTING_KEY
  );
  const siteUnderMaintenanceSetting = getStoredSetting<string | boolean>(
    SITE_UNDER_MAINTENANCE_SETTING_KEY
  );
  const sitePrelaunchInviteOnlySetting = getStoredSetting<string | boolean>(
    SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY
  );
  const siteAdminEntryEnabledSetting = getStoredSetting<string | boolean>(
    SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY
  );
  const siteAdminEntryCodeHashSetting = getStoredSetting<string>(
    SITE_ADMIN_ENTRY_CODE_HASH_SETTING_KEY
  );
  const siteAdminEntryPathSetting = getStoredSetting<string>(
    SITE_ADMIN_ENTRY_PATH_SETTING_KEY
  );
  const siteLegacyLaunchModeSetting = getStoredSetting<string>(
    SITE_LEGACY_LAUNCH_MODE_SETTING_KEY
  );
  const comingSoonContentSetting = getStoredSetting<unknown>(
    SITE_COMING_SOON_CONTENT_SETTING_KEY
  );
  const comingSoonTimerSetting = getStoredSetting<unknown>(
    SITE_COMING_SOON_TIMER_SETTING_KEY
  );
  const imageFilenamePrefixSetting = getStoredSetting<string>(
    IMAGE_GENERATION_FILENAME_PREFIX_SETTING_KEY
  );
  const iconPromptsSetting = getStoredSetting<unknown>(ICON_PROMPTS_SETTING_KEY);
  const translateProviderModeSetting = getStoredSetting<string | boolean>(
    TRANSLATE_PROVIDER_MODE_SETTING_KEY
  );
  const liveTranslationLanguages = normalizeLiveTranslationLanguages(
    getStoredSetting<unknown>(LIVE_TRANSLATION_SUPPORTED_LANGUAGES_SETTING_KEY)
  );
  const liveTranslationDefaultLanguageA = resolveLiveTranslationLanguageCode({
    fallback: DEFAULT_LIVE_TRANSLATION_LANGUAGE_A,
    languages: liveTranslationLanguages,
    value: getStoredSetting<string>(
      LIVE_TRANSLATION_DEFAULT_LANGUAGE_A_SETTING_KEY
    ),
  });
  const liveTranslationDefaultLanguageB = resolveLiveTranslationLanguageCode({
    fallback: DEFAULT_LIVE_TRANSLATION_LANGUAGE_B,
    languages: liveTranslationLanguages,
    value: getStoredSetting<string>(
      LIVE_TRANSLATION_DEFAULT_LANGUAGE_B_SETTING_KEY
    ),
  });
  const liveTranslationSystemInstruction =
    getStoredSetting<string>(LIVE_TRANSLATION_SYSTEM_INSTRUCTION_SETTING_KEY) ||
    DEFAULT_LIVE_TRANSLATION_SYSTEM_INSTRUCTION;
  const freeMessageSettings = normalizeFreeMessageSettings(
    getStoredSetting(FREE_MESSAGE_SETTINGS_KEY)
  );
  return {
    appSettingReadSource: appSettingState.source,
    featureAccessState,
    modelsRaw: modelsState.value,
    modelConfigsLoadFailed: modelsState.failed,
    privacyPolicySetting,
    termsOfServiceSetting,
    aboutUsSetting,
    aboutUsContentByLanguageSetting,
    privacyPolicyByLanguageSetting,
    termsOfServiceByLanguageSetting,
    suggestedPromptsSetting,
    suggestedPromptsByLanguageSetting,
    languages: languagesState.value,
    languagesLoadFailed: languagesState.failed,
    translationFeatureLanguages: translationFeatureLanguagesState.value,
    translationFeatureLanguagesLoadFailed: translationFeatureLanguagesState.failed,
    freeMessageSettings,
    sitePublicLaunchedSetting,
    siteUnderMaintenanceSetting,
    sitePrelaunchInviteOnlySetting,
    siteAdminEntryEnabledSetting,
    siteAdminEntryCodeHashSetting,
    siteAdminEntryPathSetting,
    siteLegacyLaunchModeSetting,
    comingSoonContentSetting,
    comingSoonTimerSetting,
    imageFilenamePrefixSetting,
    iconPromptsSetting,
    translateProviderModeSetting,
    liveTranslationLanguages,
    liveTranslationDefaultLanguageA,
    liveTranslationDefaultLanguageB,
    liveTranslationSystemInstruction,
    webSearchConfig: resolveWebSearchConfig(
      new Map(
        [
          WEB_SEARCH_PROVIDER_SETTING_KEY,
          WEB_SEARCH_FALLBACK_PROVIDER_SETTING_KEY,
          WEB_SEARCH_ENABLED_WEB_SETTING_KEY,
          WEB_SEARCH_ENABLED_NATIVE_SETTING_KEY,
          WEB_SEARCH_FREE_USERS_ENABLED_SETTING_KEY,
          WEB_SEARCH_PAID_USERS_ENABLED_SETTING_KEY,
          WEB_SEARCH_MAX_CALLS_SETTING_KEY,
          WEB_SEARCH_CREDIT_MULTIPLIER_SETTING_KEY,
        ].map((key) => [key, appSettingValuesByKey.get(key)])
      ),
      {
        accessMode: featureAccessState.values.get(WEB_SEARCH_ENABLED_SETTING_KEY),
        readState: appSettingState.source === "snapshot-db" ? "confirmed" : "fallback",
      }
    ),
  };
}

function buildFallbackAdminSettingsData() {
  return {
    appSettingReadSource: "last-known" as AppSettingReadSource,
    featureAccessState: buildFeatureAccessSnapshotFromValues({
      source: "admin.settings.fallback",
      status: "unavailable",
      values: new Map(),
    }),
    modelsRaw: [],
    modelConfigsLoadFailed: true,
    privacyPolicySetting: null,
    termsOfServiceSetting: null,
    aboutUsSetting: null,
    aboutUsContentByLanguageSetting: null,
    privacyPolicyByLanguageSetting: null,
    termsOfServiceByLanguageSetting: null,
    suggestedPromptsSetting: null,
    suggestedPromptsByLanguageSetting: null,
    suggestedPromptsEnabledSetting: null,
    languages: [],
    languagesLoadFailed: true,
    translationFeatureLanguages: [],
    translationFeatureLanguagesLoadFailed: true,
    freeMessageSettings: normalizeFreeMessageSettings(null),
    calculatorEnabledSetting: null,
    sitePublicLaunchedSetting: null,
    siteUnderMaintenanceSetting: null,
    sitePrelaunchInviteOnlySetting: null,
    siteAdminEntryEnabledSetting: null,
    siteAdminEntryCodeHashSetting: null,
    siteAdminEntryPathSetting: null,
    siteLegacyLaunchModeSetting: null,
    comingSoonContentSetting: null,
    comingSoonTimerSetting: null,
    imageFilenamePrefixSetting: null,
    iconPromptsSetting: null,
    translateProviderModeSetting: null,
    liveTranslationLanguages: normalizeLiveTranslationLanguages(null),
    liveTranslationDefaultLanguageA: DEFAULT_LIVE_TRANSLATION_LANGUAGE_A,
    liveTranslationDefaultLanguageB: DEFAULT_LIVE_TRANSLATION_LANGUAGE_B,
    liveTranslationSystemInstruction:
      DEFAULT_LIVE_TRANSLATION_SYSTEM_INSTRUCTION,
    webSearchConfig: resolveWebSearchConfig(new Map(), {
      accessMode: "admin_only",
      readState: "fallback",
    }),
  } as Awaited<ReturnType<typeof loadAdminSettingsData>>;
}

type AdminSettingsSearchParams = { notice?: string };

function toDateTimeLocalInputValue(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - timezoneOffsetMs)
    .toISOString()
    .slice(0, 16);
}

function CollapsibleSection({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group overflow-hidden rounded-lg border bg-card shadow-sm"
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-6 py-4">
        <div className="space-y-1">
          <h2 className="font-semibold text-lg">{title}</h2>
          {description ? (
            <p className="text-muted-foreground text-sm">{description}</p>
          ) : null}
        </div>
        <span className="font-semibold text-muted-foreground text-xs transition-transform duration-150 group-open:rotate-180">
          ▼
        </span>
      </summary>
      <div className="border-t px-6 py-5">
        <div className="space-y-4">{children}</div>
      </div>
    </details>
  );
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<AdminSettingsSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const notice = resolvedSearchParams?.notice;

  let settingsData: Awaited<ReturnType<typeof loadAdminSettingsData>>;
  try {
    settingsData = await loadAdminSettingsData();
  } catch (error) {
    console.error(
      "[admin/settings] Unexpected settings render failure. Falling back to safe defaults.",
      error
    );
    settingsData = buildFallbackAdminSettingsData();

    try {
      const essentialValues = await loadEssentialFallbackSettingMap();
      const getEssential = <T,>(key: string): T | null => {
        const value = essentialValues.get(key);
        return value === undefined ? null : (value as T);
      };
      settingsData = {
        ...settingsData,
        appSettingReadSource: "essential-db",
        sitePublicLaunchedSetting:
          getEssential<string | boolean>(SITE_PUBLIC_LAUNCHED_SETTING_KEY) ??
          settingsData.sitePublicLaunchedSetting,
        siteUnderMaintenanceSetting:
          getEssential<string | boolean>(SITE_UNDER_MAINTENANCE_SETTING_KEY) ??
          settingsData.siteUnderMaintenanceSetting,
        sitePrelaunchInviteOnlySetting:
          getEssential<string | boolean>(SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY) ??
          settingsData.sitePrelaunchInviteOnlySetting,
        siteAdminEntryEnabledSetting:
          getEssential<string | boolean>(SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY) ??
          settingsData.siteAdminEntryEnabledSetting,
        siteAdminEntryCodeHashSetting:
          getEssential<string>(SITE_ADMIN_ENTRY_CODE_HASH_SETTING_KEY) ??
          settingsData.siteAdminEntryCodeHashSetting,
        siteAdminEntryPathSetting:
          getEssential<string>(SITE_ADMIN_ENTRY_PATH_SETTING_KEY) ??
          settingsData.siteAdminEntryPathSetting,
        siteLegacyLaunchModeSetting:
          getEssential<string>(SITE_LEGACY_LAUNCH_MODE_SETTING_KEY) ??
          settingsData.siteLegacyLaunchModeSetting,
        comingSoonContentSetting:
          getEssential<unknown>(SITE_COMING_SOON_CONTENT_SETTING_KEY) ??
          settingsData.comingSoonContentSetting,
        comingSoonTimerSetting:
          getEssential<unknown>(SITE_COMING_SOON_TIMER_SETTING_KEY) ??
          settingsData.comingSoonTimerSetting,
      };
    } catch (fallbackReadError) {
      console.error(
        "[admin/settings] Essential fallback setting read failed.",
        fallbackReadError
      );
    }

    try {
      settingsData = {
        ...settingsData,
        featureAccessState: buildFeatureAccessSnapshotFromValues({
          source: "admin.settings.render-fallback",
          status: "unavailable",
          values: new Map(),
        }),
      };
    } catch {}

  }

  const {
    appSettingReadSource,
    featureAccessState,
    modelsRaw,
    modelConfigsLoadFailed,
    privacyPolicySetting,
    termsOfServiceSetting,
    aboutUsSetting,
    aboutUsContentByLanguageSetting,
    privacyPolicyByLanguageSetting,
    termsOfServiceByLanguageSetting,
    suggestedPromptsSetting,
    suggestedPromptsByLanguageSetting,
    languages,
    languagesLoadFailed,
    translationFeatureLanguages,
    translationFeatureLanguagesLoadFailed,
    freeMessageSettings,
    sitePublicLaunchedSetting,
    siteUnderMaintenanceSetting,
    sitePrelaunchInviteOnlySetting,
    siteAdminEntryEnabledSetting,
    siteAdminEntryCodeHashSetting,
    siteAdminEntryPathSetting,
    siteLegacyLaunchModeSetting,
    comingSoonContentSetting,
    comingSoonTimerSetting,
    imageFilenamePrefixSetting,
    iconPromptsSetting,
    translateProviderModeSetting,
    liveTranslationLanguages,
    liveTranslationDefaultLanguageA,
    liveTranslationDefaultLanguageB,
    liveTranslationSystemInstruction,
    webSearchConfig,
  } = settingsData;
  const featureAccessControlStateByField = new Map(
    ADMIN_FEATURE_ACCESS_SETTINGS.map((setting) => [
      setting.fieldName,
      resolveFeatureAccessControlState({
        settingKey: setting.settingKey,
        snapshot: featureAccessState,
      }),
    ])
  );
  console.info("[admin/settings/feature-access] hydrated", {
    appSettingReadSource,
    controls: Object.fromEntries(
      Array.from(featureAccessControlStateByField.entries()).map(
        ([fieldName, state]) => [
          fieldName,
          {
            mode: state.mode,
            readState: state.readState,
            settingKey: state.settingKey,
          },
        ]
      )
    ),
    durationMs: featureAccessState.durationMs,
    missingKeys: featureAccessState.missingKeys,
    source: featureAccessState.source,
    status: featureAccessState.status,
  });
  const featureSettingsReadConfirmed = featureAccessState.status === "confirmed";
  const degradedSettingsSections = [
    modelConfigsLoadFailed ? "model configs" : null,
    languagesLoadFailed ? "languages" : null,
    translationFeatureLanguagesLoadFailed
      ? "translation feature languages"
      : null,
  ].filter((section): section is string => Boolean(section));

  const activeModels = modelsRaw.filter((model) => !model.deletedAt);
  const enabledModels = activeModels.filter((model) => model.isEnabled);
  const enabledLiveSpeechModels = enabledModels.filter((model) =>
    isGoogleLiveTranslationModel(model)
  );
  const supportedLiveSpeechModelIds = new Set(
    activeModels
      .filter((model) => isGoogleLiveTranslationModel(model))
      .map((model) => model.id)
  );
  const imageFilenamePrefix =
    typeof imageFilenamePrefixSetting === "string"
      ? imageFilenamePrefixSetting
      : "";
  const suggestedPromptsAccessState =
    featureAccessControlStateByField.get("suggestedPromptsAccessMode") ??
    resolveFeatureAccessControlState({
      settingKey: SUGGESTED_PROMPTS_ENABLED_SETTING_KEY,
      snapshot: featureAccessState,
    });
  const iconPromptsAccessState =
    featureAccessControlStateByField.get("iconPromptsAccessMode") ??
    resolveFeatureAccessControlState({
      settingKey: ICON_PROMPTS_ENABLED_SETTING_KEY,
      snapshot: featureAccessState,
    });
  const suggestedPromptsAccessMode = suggestedPromptsAccessState.mode;
  const iconPromptsAccessMode = iconPromptsAccessState.mode;
  const iconPromptSettings = normalizeIconPromptSettings(
    iconPromptsSetting,
    iconPromptsAccessMode
  );

  const privacyPolicyContent =
    privacyPolicySetting && privacyPolicySetting.trim().length > 0
      ? privacyPolicySetting
      : DEFAULT_PRIVACY_POLICY;
  const termsOfServiceContent =
    termsOfServiceSetting && termsOfServiceSetting.trim().length > 0
      ? termsOfServiceSetting
      : DEFAULT_TERMS_OF_SERVICE;
  const aboutContent =
    aboutUsSetting && aboutUsSetting.trim().length > 0
      ? aboutUsSetting
      : DEFAULT_ABOUT_US;
  const normalizedAboutContentByLanguage: Record<string, string> = {};
  if (
    aboutUsContentByLanguageSetting &&
    typeof aboutUsContentByLanguageSetting === "object" &&
    !Array.isArray(aboutUsContentByLanguageSetting)
  ) {
    for (const [code, value] of Object.entries(
      aboutUsContentByLanguageSetting
    )) {
      if (typeof value === "string" && value.trim().length > 0) {
        normalizedAboutContentByLanguage[code] = value.trim();
      }
    }
  }
  const normalizedPrivacyPolicyByLanguage: Record<string, string> = {};
  if (
    privacyPolicyByLanguageSetting &&
    typeof privacyPolicyByLanguageSetting === "object" &&
    !Array.isArray(privacyPolicyByLanguageSetting)
  ) {
    for (const [code, value] of Object.entries(
      privacyPolicyByLanguageSetting
    )) {
      if (typeof value === "string" && value.trim().length > 0) {
        normalizedPrivacyPolicyByLanguage[code] = value.trim();
      }
    }
  }
  const normalizedTermsOfServiceByLanguage: Record<string, string> = {};
  if (
    termsOfServiceByLanguageSetting &&
    typeof termsOfServiceByLanguageSetting === "object" &&
    !Array.isArray(termsOfServiceByLanguageSetting)
  ) {
    for (const [code, value] of Object.entries(
      termsOfServiceByLanguageSetting
    )) {
      if (typeof value === "string" && value.trim().length > 0) {
        normalizedTermsOfServiceByLanguage[code] = value.trim();
      }
    }
  }
  const activeLanguagesList = languages.filter((language) => language.isActive);
  const translationFeatureLanguageRows = translationFeatureLanguages;
  const activeTranslationFeatureLanguages = translationFeatureLanguageRows.filter(
    (language) => language.isActive
  );

  const modelNameLookup = new Map(
    activeModels.map((model) => [model.id, model.displayName])
  );

  const suggestedPromptsList = Array.isArray(suggestedPromptsSetting)
    ? suggestedPromptsSetting.filter(
        (item) => typeof item === "string" && item.trim().length > 0
      )
    : [];
  const suggestedPrompts =
    suggestedPromptsList.length > 0
      ? suggestedPromptsList
      : DEFAULT_SUGGESTED_PROMPTS;
  const normalizedSuggestedPromptsByLanguage: Record<string, string[]> = {};
  if (
    suggestedPromptsByLanguageSetting &&
    typeof suggestedPromptsByLanguageSetting === "object" &&
    !Array.isArray(suggestedPromptsByLanguageSetting)
  ) {
    for (const [code, value] of Object.entries(
      suggestedPromptsByLanguageSetting as Record<string, unknown>
    )) {
      if (!Array.isArray(value)) {
        continue;
      }

      const normalized = value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0);

      if (normalized.length > 0) {
        normalizedSuggestedPromptsByLanguage[code] = normalized;
      }
    }
  }
  const siteLegacyLaunchMode = parseLegacySiteLaunchMode(
    siteLegacyLaunchModeSetting
  );
  const sitePublicLaunched = resolvePublicLaunchedSetting({
    fallback: true,
    legacyMode: siteLegacyLaunchMode,
    value: sitePublicLaunchedSetting,
  });
  const siteUnderMaintenance = parseBooleanSetting(
    siteUnderMaintenanceSetting,
    false
  );
  const sitePrelaunchInviteOnly = parseBooleanSetting(
    sitePrelaunchInviteOnlySetting,
    false
  );
  const siteAdminEntryEnabled = resolveAdminAccessEnabledSetting({
    fallback: false,
    legacyMode: siteLegacyLaunchMode,
    value: siteAdminEntryEnabledSetting,
  });
  const siteAdminEntryCodeConfigured =
    typeof siteAdminEntryCodeHashSetting === "string" &&
    siteAdminEntryCodeHashSetting.trim().length > 0;
  const siteAdminEntryPath = normalizeAdminEntryPathSetting(
    siteAdminEntryPathSetting ?? DEFAULT_ADMIN_ENTRY_PATH
  );
  const comingSoonContent =
    normalizeComingSoonContentSetting(comingSoonContentSetting);
  const comingSoonTimer = normalizeComingSoonTimerSetting(comingSoonTimerSetting);
  const calculatorAccessState =
    featureAccessControlStateByField.get("calculatorAccessMode") ??
    resolveFeatureAccessControlState({
      settingKey: CALCULATOR_FEATURE_FLAG_KEY,
      snapshot: featureAccessState,
    });
  const studyModeAccessState =
    featureAccessControlStateByField.get("studyModeAccessMode") ??
    resolveFeatureAccessControlState({
      settingKey: STUDY_MODE_FEATURE_FLAG_KEY,
      snapshot: featureAccessState,
    });
  const translateAccessState =
    featureAccessControlStateByField.get("translateAccessMode") ??
    resolveFeatureAccessControlState({
      settingKey: TRANSLATE_FEATURE_FLAG_KEY,
      snapshot: featureAccessState,
    });
  const calculatorAccessMode = calculatorAccessState.mode;
  const studyModeAccessMode = studyModeAccessState.mode;
  const translateAccessMode = translateAccessState.mode;
  const webSearchAccessState =
    featureAccessControlStateByField.get("webSearchAccessMode") ??
    resolveFeatureAccessControlState({
      settingKey: WEB_SEARCH_ENABLED_SETTING_KEY,
      snapshot: featureAccessState,
    });
  const webSearchAccessMode = webSearchAccessState.mode;
  const translateProviderMode = parseTranslateProviderModeSetting(
    translateProviderModeSetting
  );
  const jobsAccessState =
    featureAccessControlStateByField.get("jobsAccessMode") ??
    resolveFeatureAccessControlState({
      settingKey: JOBS_FEATURE_FLAG_KEY,
      snapshot: featureAccessState,
    });
  const newsAccessState =
    featureAccessControlStateByField.get("newsAccessMode") ??
    resolveFeatureAccessControlState({
      settingKey: NEWS_FEATURE_FLAG_KEY,
      snapshot: featureAccessState,
    });
  const imageGenerationAccessState =
    featureAccessControlStateByField.get("imageGenerationAccessMode") ??
    resolveFeatureAccessControlState({
      settingKey: IMAGE_GENERATION_FEATURE_FLAG_KEY,
      snapshot: featureAccessState,
    });
  const documentUploadsAccessState =
    featureAccessControlStateByField.get("documentUploadsAccessMode") ??
    resolveFeatureAccessControlState({
      settingKey: DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
      snapshot: featureAccessState,
    });
  const exploreMeghalayaAccessState =
    featureAccessControlStateByField.get("exploreMeghalayaAccessMode") ??
    resolveFeatureAccessControlState({
      settingKey: EXPLORE_MEGHALAYA_FEATURE_FLAG_KEY,
      snapshot: featureAccessState,
    });
  const legacyVoiceChatAccessState = resolveFeatureAccessControlState({
    settingKey: VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY,
    snapshot: featureAccessState,
  });
  const voiceChatAndroidAccessState =
    featureAccessControlStateByField.get("voiceChatAndroidAccessMode") ??
    resolveFeatureAccessControlState({
      settingKey: VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY,
      snapshot: featureAccessState,
    });
  const voiceChatWebAccessState =
    featureAccessControlStateByField.get("voiceChatWebAccessMode") ??
    resolveFeatureAccessControlState({
      settingKey: VOICE_CHAT_WEB_FEATURE_FLAG_KEY,
      snapshot: featureAccessState,
    });
  const liveTranslationAndroidAccessState =
    featureAccessControlStateByField.get("liveTranslationAndroidAccessMode") ??
    resolveFeatureAccessControlState({
      settingKey: LIVE_TRANSLATION_ANDROID_FEATURE_FLAG_KEY,
      snapshot: featureAccessState,
    });
  const liveTranslationWebAccessState =
    featureAccessControlStateByField.get("liveTranslationWebAccessMode") ??
    resolveFeatureAccessControlState({
      settingKey: LIVE_TRANSLATION_WEB_FEATURE_FLAG_KEY,
      snapshot: featureAccessState,
    });
  const jobsAccessMode = jobsAccessState.mode;
  const newsAccessMode = newsAccessState.mode;
  const imageGenerationAccessMode = imageGenerationAccessState.mode;
  const documentUploadsAccessMode = documentUploadsAccessState.mode;
  const exploreMeghalayaAccessMode = exploreMeghalayaAccessState.mode;
  const voiceChatAndroidAccessMode =
    voiceChatAndroidAccessState.mode ?? legacyVoiceChatAccessState.mode;
  const voiceChatAndroidReadState =
    (voiceChatAndroidAccessState.mode ?? !legacyVoiceChatAccessState.mode)
      ? voiceChatAndroidAccessState.readState
      : legacyVoiceChatAccessState.readState;
  const voiceChatWebAccessMode =
    voiceChatWebAccessState.mode ?? legacyVoiceChatAccessState.mode;
  const voiceChatWebReadState =
    (voiceChatWebAccessState.mode ?? !legacyVoiceChatAccessState.mode)
      ? voiceChatWebAccessState.readState
      : legacyVoiceChatAccessState.readState;
  const liveTranslationAndroidAccessMode =
    liveTranslationAndroidAccessState.mode;
  const liveTranslationWebAccessMode = liveTranslationWebAccessState.mode;

  const languagePromptConfigs = activeLanguagesList.map((language) => {
    const stored = normalizedSuggestedPromptsByLanguage[language.code];
    const promptsForLanguage =
      stored && stored.length > 0 ? stored : suggestedPrompts;

    return {
      language,
      prompts: promptsForLanguage,
    };
  });
  const languageAboutConfigs = activeLanguagesList.map((language) => {
    const stored = normalizedAboutContentByLanguage[language.code];
    const contentForLanguage =
      stored && stored.length > 0
        ? stored
        : language.isDefault
          ? aboutContent
          : "";

    return {
      language,
      content: contentForLanguage,
    };
  });
  const languagePrivacyConfigs = activeLanguagesList.map((language) => {
    const stored = normalizedPrivacyPolicyByLanguage[language.code];
    const contentForLanguage =
      stored && stored.length > 0
        ? stored
        : language.isDefault
          ? privacyPolicyContent
          : "";

    return {
      language,
      content: contentForLanguage,
    };
  });

  const isGlobalFreeMessageMode = freeMessageSettings.mode === "global";
  const languageTermsConfigs = activeLanguagesList.map((language) => {
    const stored = normalizedTermsOfServiceByLanguage[language.code];
    const contentForLanguage =
      stored && stored.length > 0
        ? stored
        : language.isDefault
          ? termsOfServiceContent
          : "";

    return {
      language,
      content: contentForLanguage,
    };
  });

  const appBaseUrlRaw =
    process.env.APP_BASE_URL ??
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    null;
  const appBaseUrl =
    typeof appBaseUrlRaw === "string" && /^https?:\/\//i.test(appBaseUrlRaw)
      ? appBaseUrlRaw.replace(/\/+$/, "")
      : null;
  return (
    <>
      <AdminSettingsNotice notice={notice} />

      {!featureSettingsReadConfirmed ? (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <p className="font-medium text-amber-700">
            Feature settings loaded in fallback mode.
          </p>
          <p className="mt-1 text-muted-foreground">
            The dedicated feature access query timed out or returned stale
            data, so feature controls show their exact read state instead of
            pretending fallback defaults are saved database values. Retry in a
            few seconds and check server logs for
            <span className="mx-1 font-mono text-xs">[feature-settings]</span>
            entries if this persists.
          </p>
        </div>
      ) : null}

      {degradedSettingsSections.length > 0 ? (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <p className="font-medium text-destructive">
            Some settings sections could not be confirmed.
          </p>
          <p className="mt-1 text-muted-foreground">
            Failed sections: {degradedSettingsSections.join(", ")}. Existing
            values were not replaced with confirmed empty data; refresh this
            page before editing those sections.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-6">
        <CollapsibleSection
          description="Control whether the site is publicly available or temporarily under maintenance."
          title="Maintenance"
        >
          <div className="flex flex-col gap-6">
            <SiteAccessSettingsPanel
              initialState={{
                publicLaunched: sitePublicLaunched,
                underMaintenance: siteUnderMaintenance,
                inviteOnlyPrelaunch: sitePrelaunchInviteOnly,
                adminAccessEnabled: siteAdminEntryEnabled,
                adminEntryPath: siteAdminEntryPath,
                adminEntryCodeConfigured: siteAdminEntryCodeConfigured,
              }}
            />

            <PrelaunchInvitesPanel
              appBaseUrl={appBaseUrl}
            />

            <form
              action={updateComingSoonContentAction}
              className="grid gap-4 md:grid-cols-2"
            >
              <div className="flex flex-col gap-2 md:col-span-2">
                <label className="font-medium text-sm" htmlFor="comingSoonTitle">
                  Coming soon title
                </label>
                <input
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  defaultValue={comingSoonContent.title}
                  id="comingSoonTitle"
                  name="comingSoonTitle"
                  placeholder="Coming Soon"
                />
              </div>

              <div className="flex flex-col gap-2 md:col-span-2">
                <label
                  className="font-medium text-sm"
                  htmlFor="comingSoonEyebrow"
                >
                  Supporting text
                </label>
                <input
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  defaultValue={comingSoonContent.eyebrow}
                  id="comingSoonEyebrow"
                  name="comingSoonEyebrow"
                  placeholder="There Will Be Something Very Awesome"
                />
                <p className="text-muted-foreground text-xs">
                  Controls the centered text shown on the coming-soon page.
                </p>
              </div>

              <div className="flex justify-end md:col-span-2">
                <SettingsSubmitButton
                  pendingLabel="Saving..."
                  successMessage="Coming soon content updated."
                >
                  Save content
                </SettingsSubmitButton>
              </div>
            </form>

            <form
              action={updateComingSoonTimerAction}
              className="grid gap-4 md:grid-cols-2"
            >
              <div className="flex flex-col gap-2">
                <label className="font-medium text-sm" htmlFor="comingSoonTimerMode">
                  Timer mode
                </label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  defaultValue={comingSoonTimer.mode}
                  id="comingSoonTimerMode"
                  name="comingSoonTimerMode"
                >
                  <option value="countdown">Countdown to date (future)</option>
                  <option value="countup">Count up since date (timeline)</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label
                  className="font-medium text-sm"
                  htmlFor="comingSoonTimerReferenceAt"
                >
                  Reference date/time
                </label>
                <input
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  defaultValue={toDateTimeLocalInputValue(
                    comingSoonTimer.referenceIso
                  )}
                  id="comingSoonTimerReferenceAt"
                  name="comingSoonTimerReferenceAt"
                  required
                  type="datetime-local"
                />
              </div>

              <div className="flex flex-col gap-2 md:col-span-2">
                <label
                  className="font-medium text-sm"
                  htmlFor="comingSoonTimerLabel"
                >
                  Timer label
                </label>
                <input
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  defaultValue={comingSoonTimer.label}
                  id="comingSoonTimerLabel"
                  name="comingSoonTimerLabel"
                  placeholder="Has been building for"
                />
                <p className="text-muted-foreground text-xs">
                  Example: &quot;Launching in&quot; for countdown, or
                  &quot;Has been building for&quot; for timeline mode.
                </p>
              </div>

              <div className="flex justify-end md:col-span-2">
                <SettingsSubmitButton
                  pendingLabel="Saving..."
                  successMessage="Coming soon timer updated."
                >
                  Save timer
                </SettingsSubmitButton>
              </div>
            </form>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          description="Control access to optional, user-facing experiences."
          title="Feature settings"
        >
          <div className="flex flex-col gap-6">
            <FeatureAccessModeControl
              currentMode={calculatorAccessMode}
              description="Show or hide the calculator tool in sidebar navigation. When disabled, direct route access returns a 404."
              fieldName="calculatorAccessMode"
              readState={calculatorAccessState.readState}
              successMessage="Calculator availability updated."
              title="Calculator"
            />

            <FeatureAccessModeControl
              currentMode={studyModeAccessMode}
              description="Show or hide the guided Study chat experience for exam question papers."
              fieldName="studyModeAccessMode"
              readState={studyModeAccessState.readState}
              successMessage="Study mode availability updated."
              title="Study mode"
            />

            <FeatureAccessModeControl
              currentMode={translateAccessMode}
              description="Show or hide the Translate page and sidebar entry. When disabled, end users cannot access translation routes."
              fieldName="translateAccessMode"
              readState={translateAccessState.readState}
              successMessage="Translate availability updated."
              title="Translate"
            />

            <FeatureAccessModeControl
              currentMode={jobsAccessMode}
              description="Show or hide the Jobs experience for browsing uploaded job postings."
              fieldName="jobsAccessMode"
              readState={jobsAccessState.readState}
              successMessage="Jobs mode availability updated."
              title="Jobs mode"
            />

            <FeatureAccessModeControl
              currentMode={newsAccessMode}
              description="Show or hide the current News chat experience. News also requires Web Search access for the same user."
              fieldName="newsAccessMode"
              readState={newsAccessState.readState}
              successMessage="News availability updated."
              title="News"
            />

            <FeatureAccessModeControl
              currentMode={imageGenerationAccessMode}
              description="Show or hide the image generation entry points across the chat experience."
              fieldName="imageGenerationAccessMode"
              readState={imageGenerationAccessState.readState}
              successMessage="Image generation availability updated."
              title="AI image generation"
            />

            <FeatureAccessModeControl
              currentMode={documentUploadsAccessMode}
              description="Allow users to upload PDF and DOCX files in chat."
              fieldName="documentUploadsAccessMode"
              readState={documentUploadsAccessState.readState}
              successMessage="Document upload availability updated."
              title="Document uploads"
            />

            <FeatureAccessModeControl
              currentMode={exploreMeghalayaAccessMode}
              description="Show or hide the location-aware Explore Meghalaya discovery experience on web and Android."
              fieldName="exploreMeghalayaAccessMode"
              readState={exploreMeghalayaAccessState.readState}
              successMessage="Explore Meghalaya availability updated."
              title="Explore Meghalaya"
            />

            <FeatureAccessModeControl
              currentMode={voiceChatAndroidAccessMode}
              description="Allow Android native users to talk to chat with Gemini Live voice."
              fieldName="voiceChatAndroidAccessMode"
              readState={voiceChatAndroidReadState}
              successMessage="Android voice chat availability updated."
              title="Voice chat - Android"
            />

            <FeatureAccessModeControl
              currentMode={voiceChatWebAccessMode}
              description="Allow web users to talk to chat with Gemini Live voice from supported browsers."
              fieldName="voiceChatWebAccessMode"
              readState={voiceChatWebReadState}
              successMessage="Web voice chat availability updated."
              title="Voice chat - Web"
            />

            <FeatureAccessModeControl
              currentMode={liveTranslationAndroidAccessMode}
              description="Allow Android native users to use Gemini Live as a voice-to-voice interpreter."
              fieldName="liveTranslationAndroidAccessMode"
              readState={liveTranslationAndroidAccessState.readState}
              successMessage="Android Live Translation availability updated."
              title="Live Translation - Android"
            />

            <FeatureAccessModeControl
              currentMode={liveTranslationWebAccessMode}
              description="Allow web users to use Gemini Live as a voice-to-voice interpreter from supported browsers."
              fieldName="liveTranslationWebAccessMode"
              readState={liveTranslationWebAccessState.readState}
              successMessage="Web Live Translation availability updated."
              title="Live Translation - Web"
            />

            <FeatureAccessModeControl
              currentMode={webSearchAccessMode}
              description="Control whether time-sensitive public questions may use grounded web search."
              fieldName="webSearchAccessMode"
              readState={webSearchAccessState.readState}
              successMessage="Web Search availability updated."
              title="Web Search"
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          description={
            <EditableTranslation
              defaultText="Configure grounding, platform availability, and credit pricing."
              description="Description for the Web Search settings section in Admin Settings."
              translationKey="admin.web_search.section_description"
            />
          }
          title={
            <EditableTranslation
              defaultText="Web Search settings"
              description="Title for the Web Search settings section in Admin Settings."
              translationKey="admin.web_search.section_title"
            />
          }
        >
          <WebSearchSettingsForm config={webSearchConfig} />
        </CollapsibleSection>

        <CollapsibleSection
          description="Set defaults for generated image downloads."
          title="Image generation defaults"
        >
          <form
            action={updateImageFilenamePrefixAction}
            className="grid gap-4 md:grid-cols-2"
          >
            <div className="flex flex-col gap-2 md:col-span-2">
              <label
                className="font-medium text-sm"
                htmlFor="imageFilenamePrefix"
              >
                Download filename prefix
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                defaultValue={imageFilenamePrefix}
                id="imageFilenamePrefix"
                name="imageFilenamePrefix"
                placeholder="nano-banana"
              />
              <p className="text-muted-foreground text-xs">
                Leave blank to use the default prefix in generated image
                downloads.
              </p>
            </div>

            <div className="flex justify-end md:col-span-2">
              <SettingsSubmitButton
                pendingLabel="Saving..."
                successMessage="Image filename prefix updated."
              >
                Save defaults
              </SettingsSubmitButton>
            </div>
          </form>
        </CollapsibleSection>

        <CollapsibleSection
          description="Choose whether complimentary daily messages come from each model or a single global allowance."
          title="Free message policy"
        >
          <form
            action={updateFreeMessageSettingsAction}
            className="grid gap-6 md:grid-cols-2"
          >
            <fieldset className="space-y-3">
              <legend className="font-medium text-sm">Allowance mode</legend>
              <label className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm">
                <input
                  className="mt-1 h-4 w-4 cursor-pointer"
                  defaultChecked={freeMessageSettings.mode === "per-model"}
                  name="mode"
                  type="radio"
                  value="per-model"
                />
                <span>
                  <span className="font-medium">Per model allowances</span>
                  <br />
                  <span className="text-muted-foreground">
                    Each model can define its own complimentary daily messages.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm">
                <input
                  className="mt-1 h-4 w-4 cursor-pointer"
                  defaultChecked={freeMessageSettings.mode === "global"}
                  name="mode"
                  type="radio"
                  value="global"
                />
                <span>
                  <span className="font-medium">One limit for all models</span>
                  <br />
                  <span className="text-muted-foreground">
                    Override per-model allowances and use the global value
                    below.
                  </span>
                </span>
              </label>
            </fieldset>
            <div className="flex flex-col gap-2">
              <label className="font-medium text-sm" htmlFor="globalLimit">
                Global daily free messages
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                defaultValue={freeMessageSettings.globalLimit}
                id="globalLimit"
                min={0}
                name="globalLimit"
                step={1}
                type="number"
              />
              <p className="text-muted-foreground text-xs">
                Used only when &ldquo;One limit for all models&rdquo; is
                selected.
              </p>
            </div>
            <div className="flex justify-end md:col-span-2">
              <SettingsSubmitButton
                pendingLabel="Saving..."
                refreshOnSuccess={true}
                successMessage="Free message policy updated."
              >
                Save policy
              </SettingsSubmitButton>
            </div>
          </form>
          {isGlobalFreeMessageMode ? (
            <div className="rounded-md bg-amber-50 px-4 py-3 text-amber-800 text-sm dark:bg-amber-500/10 dark:text-amber-100">
              Per-model inputs are locked because a global allowance of{" "}
              {freeMessageSettings.globalLimit.toLocaleString()} messages per
              day is active.
            </div>
          ) : null}
        </CollapsibleSection>

        <CollapsibleSection
          description="Manage Translate-only target languages and choose whether translation runs through Google Translation API or the existing AI model flow."
          title="Translation settings"
        >
          <div className="space-y-6">
            <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm">
              <p className="font-medium">
                Translation languages are separate from display languages.
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                Active translation languages appear on the Translate page.
                Google mode ignores model and prompt settings. AI mode uses the
                configured model and system prompt for each language.
              </p>
            </div>

            <form
              action={updateTranslateProviderModeAction}
              className="grid gap-4 rounded-lg border bg-background p-4 md:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="flex flex-col gap-2">
                <label
                  className="font-medium text-sm"
                  htmlFor="translate-provider-mode"
                >
                  Translation provider mode
                </label>
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  defaultValue={translateProviderMode}
                  id="translate-provider-mode"
                  name="translateProviderMode"
                >
                  <option value="google">Google Translation API</option>
                  <option value="ai">AI model-based translation</option>
                </select>
                <p className="text-muted-foreground text-xs">
                  Google mode uses Google Translation API for text and the
                  browser speech-recognition transcript flow for voice. AI mode
                  uses the admin-selected translation model and per-language
                  system prompt.
                </p>
              </div>
              <div className="flex items-end justify-end">
                <SettingsSubmitButton pendingLabel="Saving...">
                  Save provider mode
                </SettingsSubmitButton>
              </div>
            </form>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
              <form
                action={createTranslationFeatureLanguageAction}
                className="flex flex-col gap-4 rounded-lg border bg-background p-4"
              >
                <div className="flex flex-col gap-2">
                  <label
                    className="font-medium text-sm"
                    htmlFor="translation-feature-language-code"
                  >
                    Translation language code
                  </label>
                  <input
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                    id="translation-feature-language-code"
                    name="code"
                    pattern="[a-z0-9-]{2,16}"
                    placeholder="fr"
                    required
                    title="Use 2-16 lowercase letters, numbers, or hyphens."
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label
                    className="font-medium text-sm"
                    htmlFor="translation-feature-language-name"
                  >
                    Translation language name
                  </label>
                  <input
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                    id="translation-feature-language-name"
                    name="name"
                    placeholder="French"
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label
                    className="font-medium text-sm"
                    htmlFor="translation-feature-language-model"
                  >
                    Text translation model
                  </label>
                  <select
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                    defaultValue=""
                    disabled={
                      translateProviderMode === "google" ||
                      enabledModels.length === 0
                    }
                    id="translation-feature-language-model"
                    name="modelConfigId"
                    required={translateProviderMode === "ai"}
                  >
                    <option value="">Select a model</option>
                    {enabledModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.displayName} ({model.provider})
                      </option>
                    ))}
                  </select>
                  <p className="text-muted-foreground text-xs">
                    {translateProviderMode === "google"
                      ? "Ignored in Google mode."
                      : "This model is used for text translation and live speech translation when AI mode is selected."}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <label
                    className="font-medium text-sm"
                    htmlFor="translation-feature-language-speech-model"
                  >
                    Speech/live model
                  </label>
                  <select
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                    defaultValue=""
                    disabled={translateProviderMode === "google"}
                    id="translation-feature-language-speech-model"
                    name="speechModelConfigId"
                  >
                    <option value="">
                      No live speech model (browser speech fallback)
                    </option>
                    {enabledLiveSpeechModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.displayName} ({model.provider})
                      </option>
                    ))}
                  </select>
                  <p className="text-muted-foreground text-xs">
                    {translateProviderMode === "google"
                      ? "Ignored in Google mode."
                      : enabledLiveSpeechModels.length > 0
                        ? "Optional. Configure an enabled Google live/native-audio model here to power true live speech. If left blank, the Translate page falls back to browser speech recognition."
                        : "No enabled Google live/native-audio models are available. The Translate page will use browser speech recognition only."}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <label
                    className="font-medium text-sm"
                    htmlFor="translation-feature-language-prompt"
                  >
                    Translation system prompt
                  </label>
                  <textarea
                    className="min-h-[140px] rounded-md border bg-background px-3 py-2 text-sm"
                    disabled={translateProviderMode === "google"}
                    id="translation-feature-language-prompt"
                    name="systemPrompt"
                    placeholder="e.g., Translate into French naturally and preserve the original formatting."
                  />
                  <p className="text-muted-foreground text-xs">
                    {translateProviderMode === "google"
                      ? "Ignored in Google mode."
                      : "This is a standalone translation prompt used only when this language is the translation target. It does not combine with the model's main system prompt."}
                  </p>
                </div>
                <label className="flex items-center gap-2 font-medium text-sm">
                  <input
                    className="h-4 w-4 cursor-pointer"
                    defaultChecked
                    name="isActive"
                    type="checkbox"
                  />
                  Active immediately
                </label>
                {translateProviderMode === "ai" && enabledModels.length === 0 ? (
                  <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-amber-800 text-xs dark:bg-amber-500/10 dark:text-amber-100">
                    Add and enable at least one model before creating
                    translation languages.
                  </div>
                ) : null}
                <SettingsSubmitButton
                  disabled={
                    translateProviderMode === "ai" &&
                    enabledModels.length === 0
                  }
                  pendingLabel="Adding..."
                  type="submit"
                >
                  Add translation language
                </SettingsSubmitButton>
              </form>

              <div className="space-y-4">
                {translationFeatureLanguageRows.length === 0 ? (
                  <div className="rounded-lg border bg-background p-4 text-muted-foreground text-sm">
                    No translation languages configured yet.
                  </div>
                ) : null}
                {translationFeatureLanguageRows.map((language) => {
                  const statusBadge = language.isActive
                    ? "text-emerald-600 bg-emerald-500/10"
                    : "text-muted-foreground bg-muted/60";
                  const modelName = language.modelConfigId
                    ? modelNameLookup.get(language.modelConfigId) ??
                      "Configured model unavailable"
                    : "No model selected";
                  const speechModelName = language.speechModelConfigId
                    ? supportedLiveSpeechModelIds.has(
                        language.speechModelConfigId
                      )
                      ? modelNameLookup.get(language.speechModelConfigId) ??
                        "Configured speech model unavailable"
                      : modelNameLookup.get(language.speechModelConfigId) ??
                        "Configured speech model does not support live audio"
                    : "No live speech model (browser fallback)";

                  return (
                    <details
                      className="rounded-lg border bg-background p-4"
                      key={language.id}
                    >
                      <summary className="flex cursor-pointer flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{language.name}</span>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs ${statusBadge}`}
                          >
                            {language.isActive ? "Active" : "Inactive"}
                          </span>
                          {language.isDefault ? (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-[11px] text-primary uppercase tracking-wide">
                              Default
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                          <span className="font-mono">{language.code}</span>
                          <span>•</span>
                          <span>Text: {modelName}</span>
                          <span>•</span>
                          <span>Speech: {speechModelName}</span>
                        </div>
                      </summary>
                      <div className="mt-4 space-y-4">
                        <form
                          action={updateTranslationFeatureLanguageSettingsAction}
                          className="grid gap-4 md:grid-cols-2"
                        >
                          <input
                            name="languageId"
                            type="hidden"
                            value={language.id}
                          />
                          <div className="flex flex-col gap-2">
                            <label
                              className="font-medium text-sm"
                              htmlFor={`translation-feature-language-code-${language.id}`}
                            >
                              Language code
                            </label>
                            <input
                              className="rounded-md border bg-background px-3 py-2 text-sm"
                              defaultValue={language.code}
                              id={`translation-feature-language-code-${language.id}`}
                              name="code"
                              pattern="[a-z0-9-]{2,16}"
                              required
                            />
                          </div>
                          <div className="flex flex-col gap-2">
                            <label
                              className="font-medium text-sm"
                              htmlFor={`translation-feature-language-name-${language.id}`}
                            >
                              Display name
                            </label>
                            <input
                              className="rounded-md border bg-background px-3 py-2 text-sm"
                              defaultValue={language.name}
                              id={`translation-feature-language-name-${language.id}`}
                              name="name"
                              required
                            />
                          </div>
                          <div className="flex flex-col gap-2 md:col-span-2">
                            <label
                              className="font-medium text-sm"
                              htmlFor={`translation-feature-language-model-${language.id}`}
                            >
                              Text translation model
                            </label>
                            <select
                              className="rounded-md border bg-background px-3 py-2 text-sm"
                              defaultValue={language.modelConfigId ?? ""}
                              disabled={
                                translateProviderMode === "google" ||
                                enabledModels.length === 0
                              }
                              id={`translation-feature-language-model-${language.id}`}
                              name="modelConfigId"
                              required={translateProviderMode === "ai"}
                            >
                              <option value="">Select a model</option>
                              {enabledModels.map((model) => (
                                <option key={model.id} value={model.id}>
                                  {model.displayName} ({model.provider})
                                </option>
                              ))}
                            </select>
                            <p className="text-muted-foreground text-xs">
                              {translateProviderMode === "google"
                                ? "Ignored in Google mode."
                                : `This exact model will be used for text translation into ${language.name}.`}
                            </p>
                          </div>
                          <div className="flex flex-col gap-2 md:col-span-2">
                            <label
                              className="font-medium text-sm"
                              htmlFor={`translation-feature-language-speech-model-${language.id}`}
                            >
                              Speech/live model
                            </label>
                            <select
                              className="rounded-md border bg-background px-3 py-2 text-sm"
                              defaultValue={language.speechModelConfigId ?? ""}
                              disabled={translateProviderMode === "google"}
                              id={`translation-feature-language-speech-model-${language.id}`}
                              name="speechModelConfigId"
                            >
                              <option value="">
                                No live speech model (browser speech fallback)
                              </option>
                              {enabledLiveSpeechModels.map((model) => (
                                <option key={model.id} value={model.id}>
                                  {model.displayName} ({model.provider})
                                </option>
                              ))}
                            </select>
                            <p className="text-muted-foreground text-xs">
                              {translateProviderMode === "google"
                                ? "Ignored in Google mode."
                                : enabledLiveSpeechModels.length > 0
                                  ? "Optional. Use a dedicated Google live/native-audio model here only for AI mode voice translation."
                                  : "No enabled Google live/native-audio models are available. Saving will keep browser speech fallback only."}
                            </p>
                          </div>
                          <div className="flex flex-col gap-2 md:col-span-2">
                            <label
                              className="font-medium text-sm"
                              htmlFor={`translation-feature-language-prompt-${language.id}`}
                            >
                              System prompt
                            </label>
                            <textarea
                              className="min-h-[140px] rounded-md border bg-background px-3 py-2 text-sm"
                              defaultValue={language.systemPrompt ?? ""}
                              disabled={translateProviderMode === "google"}
                              id={`translation-feature-language-prompt-${language.id}`}
                              name="systemPrompt"
                              placeholder="e.g., Translate naturally and preserve formatting."
                            />
                            <p className="text-muted-foreground text-xs">
                              {translateProviderMode === "google"
                                ? "Ignored in Google mode."
                                : "This is a standalone translation prompt for this language only. It does not combine with the model's main system prompt."}
                            </p>
                          </div>
                          <div className="flex justify-end md:col-span-2">
                            <SettingsSubmitButton
                              disabled={
                                translateProviderMode === "ai" &&
                                enabledModels.length === 0
                              }
                              pendingLabel="Saving..."
                            >
                              Save settings
                            </SettingsSubmitButton>
                          </div>
                        </form>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                          {language.isDefault ? (
                            <span className="text-muted-foreground text-xs">
                              Default translation language cannot be deactivated
                              or removed.
                            </span>
                          ) : (
                            <>
                              <form
                                action={updateTranslationFeatureLanguageStatusAction}
                              >
                                <input
                                  name="languageId"
                                  type="hidden"
                                  value={language.id}
                                />
                                <input
                                  name="intent"
                                  type="hidden"
                                  value={
                                    language.isActive
                                      ? "deactivate"
                                      : "activate"
                                  }
                                />
                                <SettingsSubmitButton
                                  pendingLabel={
                                    language.isActive
                                      ? "Disabling..."
                                      : "Enabling..."
                                  }
                                  size="sm"
                                  variant="outline"
                                >
                                  {language.isActive ? "Deactivate" : "Activate"}
                                </SettingsSubmitButton>
                              </form>
                              <form action={deleteTranslationFeatureLanguageAction}>
                                <input
                                  name="languageId"
                                  type="hidden"
                                  value={language.id}
                                />
                                <SettingsSubmitButton
                                  pendingLabel="Removing..."
                                  size="sm"
                                  variant="destructive"
                                >
                                  Remove language
                                </SettingsSubmitButton>
                              </form>
                            </>
                          )}
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>

            {activeTranslationFeatureLanguages.length === 0 ? (
              <div className="rounded-md border border-muted-foreground/30 border-dashed bg-muted/20 p-4 text-muted-foreground text-sm">
                No active translation languages are configured. End users will
                see an empty target-language list until at least one
                translation language is active.
              </div>
            ) : null}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          description="Manage supported languages, per-language system prompts, and UI sync behavior. Default language must stay active."
          title="Language settings"
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
            <form
              action={createLanguageAction}
              className="flex flex-col gap-4 rounded-lg border bg-background p-4"
            >
              <div className="flex flex-col gap-2">
                <label className="font-medium text-sm" htmlFor="language-code">
                  Language code
                </label>
                <input
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  id="language-code"
                  name="code"
                  pattern="[a-z0-9-]{2,16}"
                  placeholder="fr"
                  required
                  title="Use 2-16 lowercase letters, numbers, or hyphens."
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="font-medium text-sm" htmlFor="language-name">
                  Language name
                </label>
                <input
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  id="language-name"
                  name="name"
                  placeholder="French"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <label
                  className="font-medium text-sm"
                  htmlFor="language-system-prompt"
                >
                  Language system prompt
                </label>
                <textarea
                  className="min-h-[120px] rounded-md border bg-background px-3 py-2 text-sm"
                  id="language-system-prompt"
                  name="systemPrompt"
                  placeholder="e.g., Respond in French unless the user asks otherwise."
                />
                <p className="text-muted-foreground text-xs">
                  Appended to the selected model prompt when this language is
                  chosen.
                </p>
              </div>
              <label className="flex items-center gap-2 font-medium text-sm">
                <input
                  className="h-4 w-4 cursor-pointer"
                  name="syncUiLanguage"
                  type="checkbox"
                />
                Change UI language when selected
              </label>
              <label className="flex items-center gap-2 font-medium text-sm">
                <input
                  className="h-4 w-4 cursor-pointer"
                  defaultChecked
                  name="isActive"
                  type="checkbox"
                />
                Active immediately
              </label>
              <SettingsSubmitButton pendingLabel="Adding..." type="submit">
                Add language
              </SettingsSubmitButton>
            </form>
            <div className="space-y-4">
              {languagesLoadFailed ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive text-sm">
                  Language settings could not be loaded. This is not a
                  confirmed empty language list; refresh before editing
                  language-specific settings.
                </div>
              ) : languages.length === 0 ? (
                <div className="rounded-lg border bg-background p-4 text-muted-foreground text-sm">
                  No languages configured yet.
                </div>
              ) : null}
              {languages.map((language) => {
                const statusBadge = language.isActive
                  ? "text-emerald-600 bg-emerald-500/10"
                  : "text-muted-foreground bg-muted/60";

                return (
                  <details
                    className="rounded-lg border bg-background p-4"
                    key={language.id}
                  >
                    <summary className="flex cursor-pointer flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{language.name}</span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs ${statusBadge}`}
                        >
                          {language.isActive ? "Active" : "Inactive"}
                        </span>
                        {language.syncUiLanguage ? (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700 text-xs">
                            UI sync
                          </span>
                        ) : null}
                        {language.isDefault ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-[11px] text-primary uppercase tracking-wide">
                            Default
                          </span>
                        ) : null}
                      </div>
                      <span className="font-mono text-muted-foreground text-xs">
                        {language.code}
                      </span>
                    </summary>
                    <div className="mt-4 space-y-4">
                      <form
                        action={updateLanguageSettingsAction}
                        className="grid gap-4 md:grid-cols-2"
                      >
                        <input
                          name="languageId"
                          type="hidden"
                          value={language.id}
                        />
                        <div className="flex flex-col gap-2">
                          <label
                            className="font-medium text-sm"
                            htmlFor={`language-name-${language.id}`}
                          >
                            Display name
                          </label>
                          <input
                            className="rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={language.name}
                            id={`language-name-${language.id}`}
                            name="name"
                          />
                        </div>
                        <div className="flex flex-col gap-2 md:col-span-2">
                          <label
                            className="font-medium text-sm"
                            htmlFor={`language-prompt-${language.id}`}
                          >
                            System prompt
                          </label>
                          <textarea
                            className="min-h-[140px] rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={language.systemPrompt ?? ""}
                            id={`language-prompt-${language.id}`}
                            name="systemPrompt"
                            placeholder="e.g., Respond in this language unless the user requests another."
                          />
                          <p className="text-muted-foreground text-xs">
                            This prompt is appended to the selected model prompt.
                          </p>
                        </div>
                        <label className="flex items-center gap-2 font-medium text-sm md:col-span-2">
                          <input
                            className="h-4 w-4 cursor-pointer"
                            defaultChecked={language.syncUiLanguage}
                            name="syncUiLanguage"
                            type="checkbox"
                          />
                          Change UI language when this language is selected
                        </label>
                        <div className="flex justify-end md:col-span-2">
                          <SettingsSubmitButton pendingLabel="Saving...">
                            Save settings
                          </SettingsSubmitButton>
                        </div>
                      </form>
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                        {language.isDefault ? (
                          <span className="text-muted-foreground text-xs">
                            Default language cannot be deactivated or removed.
                          </span>
                        ) : (
                          <>
                            <form action={updateLanguageStatusAction}>
                              <input
                                name="languageId"
                                type="hidden"
                                value={language.id}
                              />
                              <input
                                name="intent"
                                type="hidden"
                                value={
                                  language.isActive ? "deactivate" : "activate"
                                }
                              />
                              <SettingsSubmitButton
                                pendingLabel={
                                  language.isActive
                                    ? "Disabling..."
                                    : "Enabling..."
                                }
                                size="sm"
                                variant="outline"
                              >
                                {language.isActive ? "Deactivate" : "Activate"}
                              </SettingsSubmitButton>
                            </form>
                            <form action={deleteLanguageAction}>
                              <input
                                name="languageId"
                                type="hidden"
                                value={language.id}
                              />
                              <SettingsSubmitButton
                                pendingLabel="Removing..."
                                size="sm"
                                variant="destructive"
                              >
                                Remove language
                              </SettingsSubmitButton>
                            </form>
                          </>
                        )}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          description="Control the quick-start prompts that appear on the home screen."
          title="Home page pre-prompts"
        >
          <div className="space-y-6">
            <CollapsibleSection
              description="Customize the quick-start prompts that appear on the home screen. Enter one prompt per line for each language."
              title="Suggested prompts"
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-4 rounded-lg border bg-background p-4">
                  <FeatureAccessModeControl
                    currentMode={suggestedPromptsAccessMode}
                    description="Toggle the suggested prompt chips shown on the home page."
                    fieldName="suggestedPromptsAccessMode"
                    readState={suggestedPromptsAccessState.readState}
                    successMessage="Suggested prompts updated."
                    title="Suggested prompts"
                  />
                </div>

                {languagePromptConfigs.length === 0 ? (
                  <div className="rounded-md border border-muted-foreground/30 border-dashed bg-muted/30 p-4 text-muted-foreground text-sm">
                    No active languages are configured. Add a language before
                    managing prompts.
                  </div>
                ) : (
                  <div className="grid gap-6 lg:grid-cols-2">
                    {languagePromptConfigs.map(({ language, prompts }) => (
                      <LanguagePromptsForm
                        initialPrompts={prompts}
                        key={language.id}
                        language={language}
                        onSubmit={updateSuggestedPromptsAction}
                      />
                    ))}
                  </div>
                )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              description="Manage icon-based quick prompts displayed on the home screen."
              title="Icon pre-prompts"
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-4 rounded-lg border bg-background p-4">
                  <FeatureAccessModeControl
                    currentMode={iconPromptsAccessMode}
                    description="Toggle the icon-based prompt section shown on the home page."
                    fieldName="iconPromptsAccessMode"
                    readState={iconPromptsAccessState.readState}
                    successMessage="Icon pre-prompts updated."
                    title="Icon pre-prompts"
                  />
                </div>

                {activeLanguagesList.length === 0 ? (
                  <div className="rounded-md border border-muted-foreground/30 border-dashed bg-muted/30 p-4 text-muted-foreground text-sm">
                    No active languages are configured. Add a language before
                    managing icon prompts.
                  </div>
                ) : (
                  <IconPromptSettingsForm
                    initialItems={iconPromptSettings.items}
                    languages={activeLanguagesList}
                    onSubmit={updateIconPromptsAction}
                  />
                )}
              </div>
            </CollapsibleSection>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          description="Update the copy shown on the public About, Privacy Policy, and Terms of Service pages."
          title="Public page content"
        >
          {activeLanguagesList.length === 0 ? (
            <div className="rounded-md border border-muted-foreground/30 border-dashed bg-muted/30 p-4 text-muted-foreground text-sm">
              No active languages are configured. Add a language before managing
              public page content.
            </div>
          ) : (
            <div className="space-y-10">
              <div className="space-y-4">
                <h3 className="font-semibold text-base">About page content</h3>
                <div className="grid gap-6 lg:grid-cols-2">
                  {languageAboutConfigs.map(({ language, content }) => (
                    <LanguageContentForm
                      contentLabel="about content"
                      helperText={{
                        default:
                          "Shown on the about page when no localized version is available.",
                        localized: `Displayed when ${language.name} is selected. Falls back to the default language if left blank.`,
                      }}
                      initialContent={content}
                      key={language.id}
                      language={language}
                      onSubmit={updateAboutContentAction}
                      placeholders={{
                        default: "Enter about content",
                        localized: "Provide localized about content",
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-base">
                    Privacy policy content
                  </h3>
                  <p className="text-muted-foreground text-xs">
                    Appears at{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      /privacy-policy
                    </code>
                    .
                  </p>
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  {languagePrivacyConfigs.map(({ language, content }) => (
                    <LanguageContentForm
                      contentLabel="privacy policy"
                      helperText={{
                        default:
                          "Shown on the privacy policy page when no localized version is available.",
                        localized: `Displayed when ${language.name} is selected. Falls back to the default language if left blank.`,
                      }}
                      initialContent={content}
                      key={language.id}
                      language={language}
                      onSubmit={updatePrivacyPolicyByLanguageAction}
                      placeholders={{
                        default: "Enter privacy policy content",
                        localized: "Provide localized privacy policy content",
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-base">
                    Terms of service content
                  </h3>
                  <p className="text-muted-foreground text-xs">
                    Appears at{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      /terms-of-service
                    </code>
                    .
                  </p>
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  {languageTermsConfigs.map(({ language, content }) => (
                    <LanguageContentForm
                      contentLabel="terms of service"
                      helperText={{
                        default:
                          "Shown on the terms of service page when no localized version is available.",
                        localized: `Displayed when ${language.name} is selected. Falls back to the default language if left blank.`,
                      }}
                      initialContent={content}
                      key={language.id}
                      language={language}
                      onSubmit={updateTermsOfServiceByLanguageAction}
                      placeholders={{
                        default: "Enter terms of service content",
                        localized: "Provide localized terms of service content",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection
              description="Configure the language pair and interpreter behavior used by the Live Translation page."
              title="Live Translation defaults"
            >
              <form
                action={updateLiveTranslationSettingsAction}
                className="grid gap-4 md:grid-cols-2"
              >
                <div className="flex flex-col gap-2 md:col-span-2">
                  <label
                    className="font-medium text-sm"
                    htmlFor="liveTranslationSupportedLanguages"
                  >
                    Supported languages
                  </label>
                  <textarea
                    className="min-h-[130px] rounded-md border bg-background px-3 py-2 font-mono text-xs"
                    defaultValue={serializeLiveTranslationLanguagesText(
                      liveTranslationLanguages
                    )}
                    id="liveTranslationSupportedLanguages"
                    name="liveTranslationSupportedLanguages"
                  />
                  <p className="text-muted-foreground text-xs">
                    One language per line as code|Name. Keep auto|Auto Detect
                    for the common Auto Detect to Khasi flow.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    className="font-medium text-sm"
                    htmlFor="liveTranslationDefaultLanguageA"
                  >
                    Default Language A
                  </label>
                  <select
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                    defaultValue={liveTranslationDefaultLanguageA}
                    id="liveTranslationDefaultLanguageA"
                    name="liveTranslationDefaultLanguageA"
                  >
                    {liveTranslationLanguages.map((language) => (
                      <option key={language.code} value={language.code}>
                        {language.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    className="font-medium text-sm"
                    htmlFor="liveTranslationDefaultLanguageB"
                  >
                    Default Language B
                  </label>
                  <select
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                    defaultValue={liveTranslationDefaultLanguageB}
                    id="liveTranslationDefaultLanguageB"
                    name="liveTranslationDefaultLanguageB"
                  >
                    {liveTranslationLanguages
                      .filter((language) => language.code !== "auto")
                      .map((language) => (
                        <option key={language.code} value={language.code}>
                          {language.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="flex flex-col gap-2 md:col-span-2">
                  <label
                    className="font-medium text-sm"
                    htmlFor="liveTranslationSystemInstruction"
                  >
                    Interpreter system instructions
                  </label>
                  <textarea
                    className="min-h-[150px] rounded-md border bg-background px-3 py-2 text-sm"
                    defaultValue={liveTranslationSystemInstruction}
                    id="liveTranslationSystemInstruction"
                    name="liveTranslationSystemInstruction"
                  />
                  <p className="text-muted-foreground text-xs">
                    These instructions are combined with the selected language
                    pair at session start. Live voice model settings still
                    control model, voice, platform, and credit multiplier.
                  </p>
                </div>

                <div className="flex justify-end md:col-span-2">
                  <SettingsSubmitButton
                    pendingLabel="Saving..."
                    successMessage="Live Translation settings updated."
                  >
                    Save Live Translation settings
                  </SettingsSubmitButton>
                </div>
              </form>
            </CollapsibleSection>
      </div>
    </>
  );
}
