import { unstable_cache } from "next/cache";
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
  SITE_MOBILE_APP_LAUNCHED_SETTING_KEY,
  SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY,
  SITE_UNDER_MAINTENANCE_SETTING_KEY,
  SITE_WEB_LAUNCHED_SETTING_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
  SUGGESTED_PROMPTS_ENABLED_SETTING_KEY,
  TRANSLATE_FEATURE_FLAG_KEY,
  TRANSLATE_PROVIDER_MODE_SETTING_KEY,
  VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import {
  getAdminAppSettingsByKeys,
  getLastKnownAppSettingsByKeys,
  listAdminLanguagesWithSettings,
  listAdminSettingsModelConfigs,
  listAdminTranslationFeatureLanguages,
  listImageModelConfigs,
} from "@/lib/db/queries";
import { normalizeFreeMessageSettings } from "@/lib/free-messages";
import {
  DEFAULT_LIVE_TRANSLATION_LANGUAGE_A,
  DEFAULT_LIVE_TRANSLATION_LANGUAGE_B,
  DEFAULT_LIVE_TRANSLATION_SYSTEM_INSTRUCTION,
  normalizeLiveTranslationLanguages,
  resolveLiveTranslationLanguageCode,
} from "@/lib/live-translation/config";
import {
  buildFeatureAccessSnapshotFromValues,
  loadFeatureAccessSettingsByKeys,
} from "@/lib/settings/feature-access-settings";
import { withTimeout } from "@/lib/utils/async";
import {
  AdminSettingsView,
  SETTINGS_FEATURE_ACCESS_SETTINGS,
} from "./settings-view";

export const dynamic = "force-dynamic";

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
  SITE_WEB_LAUNCHED_SETTING_KEY,
  SITE_MOBILE_APP_LAUNCHED_SETTING_KEY,
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
] as const;
const ESSENTIAL_FALLBACK_SETTING_KEYS = [
  SITE_WEB_LAUNCHED_SETTING_KEY,
  SITE_MOBILE_APP_LAUNCHED_SETTING_KEY,
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
    ...SETTINGS_FEATURE_ACCESS_SETTINGS.map((setting) => setting.settingKey),
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
  () => listAdminSettingsModelConfigs(),
  ["admin-settings:model-configs:v2"],
  {
    revalidate: ADMIN_SETTINGS_LIST_CACHE_REVALIDATE_SECONDS,
    tags: [ADMIN_SETTINGS_MODELS_CACHE_TAG, MODEL_REGISTRY_CACHE_TAG],
  }
);
const listAdminImageModelConfigsCached = unstable_cache(
  () => listImageModelConfigs({ includeDisabled: true }),
  ["admin-settings-image-models:v1"],
  {
    revalidate: ADMIN_SETTINGS_LIST_CACHE_REVALIDATE_SECONDS,
    tags: [ADMIN_SETTINGS_MODELS_CACHE_TAG],
  }
);
const listAdminLanguagesCached = unstable_cache(
  () => listAdminLanguagesWithSettings(),
  ["admin-settings:languages:v2"],
  {
    revalidate: ADMIN_SETTINGS_LIST_CACHE_REVALIDATE_SECONDS,
    tags: [ADMIN_SETTINGS_LANGUAGES_CACHE_TAG, "languages"],
  }
);
const listAdminTranslationFeatureLanguagesCached = unstable_cache(
  () => listAdminTranslationFeatureLanguages(),
  ["admin-settings:translation-feature-languages:v2"],
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
    getAdminAppSettingsByKeys([...ESSENTIAL_FALLBACK_SETTING_KEYS]),
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
  try {
    const settings = await withTimeout(
      getAdminAppSettingsByKeys([...SETTINGS_SNAPSHOT_KEYS]),
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

  // The normal snapshot already includes the essential keys. Only issue the
  // smaller recovery read after a failure, rather than queuing it on every load.
  const essentialSettings = await withTimeout(
    getAdminAppSettingsByKeys([...ESSENTIAL_FALLBACK_SETTING_KEYS]),
    ADMIN_SETTINGS_SNAPSHOT_QUERY_TIMEOUT_MS
  ).catch((error) => {
    console.error(
      "[admin/settings] Essential app settings query failed. Retrying with last known values.",
      error
    );
    return null;
  });
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
      getAdminAppSettingsByKeys([...ADMIN_FEATURE_ACCESS_SETTING_KEYS]),
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

async function loadAdminSettingsData() {
  const serializeDbReads = shouldSerializeAdminDbReads();
  const dedicatedFeatureAccessStatePromise = loadAdminFeatureAccessState();
  const appSettingStatePromise = serializeDbReads
    ? dedicatedFeatureAccessStatePromise.then(() => loadAppSettingValuesByKey())
    : loadAppSettingValuesByKey();
  const stageOneSettled = Promise.all([
    dedicatedFeatureAccessStatePromise,
    appSettingStatePromise,
  ]);
  // The model, language and image reads below are independent of the settings
  // snapshot and usually served from cache, so start them alongside it unless
  // reads must be serialized onto a single connection.
  const startStageTwo = () => {
    const imageModelConfigsStatePromise = settingsQueryState(
      "image model configs",
      () => listAdminImageModelConfigsCached(),
      []
    );
    return Promise.all([
      resolveAdminDbReadGroup([
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
      ]),
      imageModelConfigsStatePromise,
    ]);
  };
  const stageTwo = serializeDbReads
    ? stageOneSettled.then(startStageTwo)
    : startStageTwo();
  // Awaited below; this only stops a stage-one failure from also surfacing as
  // an unhandled rejection of the chained stage two.
  stageTwo.catch(() => undefined);
  const [dedicatedFeatureAccessState, appSettingState] = await stageOneSettled;
  const [
    [modelsState, languagesState, translationFeatureLanguagesState],
    imageModelConfigsState,
  ] = await stageTwo;
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
  const siteWebLaunchedSetting = getStoredSetting<string | boolean>(
    SITE_WEB_LAUNCHED_SETTING_KEY
  );
  const siteMobileAppLaunchedSetting = getStoredSetting<string | boolean>(
    SITE_MOBILE_APP_LAUNCHED_SETTING_KEY
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
    imageModels: imageModelConfigsState.value,
    imageModelConfigsLoadFailed: imageModelConfigsState.failed,
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
    siteWebLaunchedSetting,
    siteMobileAppLaunchedSetting,
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
    imageModels: [],
    imageModelConfigsLoadFailed: true,
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
    siteWebLaunchedSetting: null,
    siteMobileAppLaunchedSetting: null,
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
  } as Awaited<ReturnType<typeof loadAdminSettingsData>>;
}

export type AdminSettingsData = Awaited<
  ReturnType<typeof loadAdminSettingsData>
>;

type AdminSettingsSearchParams = { notice?: string };

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
        siteWebLaunchedSetting:
          getEssential<string | boolean>(SITE_WEB_LAUNCHED_SETTING_KEY) ??
          settingsData.siteWebLaunchedSetting,
        siteMobileAppLaunchedSetting:
          getEssential<string | boolean>(SITE_MOBILE_APP_LAUNCHED_SETTING_KEY) ??
          settingsData.siteMobileAppLaunchedSetting,
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

  return <AdminSettingsView data={settingsData} notice={notice} />;
}
