import {
  AudioLines,
  FileText,
  Globe,
  ImageIcon,
  Languages,
  LayoutGrid,
  MessageSquareText,
  ShieldCheck,
  ToggleRight,
} from "lucide-react";
import Link from "next/link";
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
import { AdminSectionIndex } from "@/components/admin/admin-section-index";
import {
  AdminNotice,
  AdminPageHeader,
  AdminStatusPill,
} from "@/components/admin/admin-ui";
import { EditableTranslation } from "@/components/translation-edit-provider";
import {
  CALCULATOR_FEATURE_FLAG_KEY,
  DEFAULT_ABOUT_US,
  DEFAULT_PRIVACY_POLICY,
  DEFAULT_SUGGESTED_PROMPTS,
  DEFAULT_TERMS_OF_SERVICE,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  EXPLORE_MEGHALAYA_FEATURE_FLAG_KEY,
  ICON_PROMPTS_ENABLED_SETTING_KEY,
  IMAGE_GENERATION_FEATURE_FLAG_KEY,
  IMAGE_WEB_REFERENCES_FEATURE_FLAG_KEY,
  JOBS_FEATURE_FLAG_KEY,
  LIVE_TRANSLATION_ANDROID_FEATURE_FLAG_KEY,
  LIVE_TRANSLATION_WEB_FEATURE_FLAG_KEY,
  NEWS_FEATURE_FLAG_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
  SUGGESTED_PROMPTS_ENABLED_SETTING_KEY,
  TRANSLATE_FEATURE_FLAG_KEY,
  VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY,
  VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY,
  VOICE_CHAT_WEB_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import { normalizeIconPromptSettings } from "@/lib/icon-prompts";
import { serializeLiveTranslationLanguagesText } from "@/lib/live-translation/config";
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
  resolveFeatureAccessControlState,
} from "@/lib/settings/feature-access-settings";
import {
  parseLegacySiteLaunchMode,
  resolveAdminAccessEnabledSetting,
  resolvePublicLaunchedSetting,
} from "@/lib/settings/site-launch";
import { parseTranslateProviderModeSetting } from "@/lib/translate/config";
import { isGoogleLiveTranslationModel } from "@/lib/translate/live";
import { FeatureAccessModeControl } from "./feature-access-mode-control";
import { IconPromptSettingsForm } from "./icon-prompt-settings-form";
import {
  ImageModelActivationButton,
  ImageModelActivationProvider,
  ImageModelActiveBadge,
} from "./image-model-activation-control";
import { LanguageContentForm } from "./language-content-form";
import { LanguagePromptsForm } from "./language-prompts-form";
import { AdminSettingsNotice } from "./notice";
import type { AdminSettingsData } from "./page";
import { PrelaunchInvitesPanel } from "./prelaunch-invites-panel";
import {
  SETTINGS_CHECKBOX_CLASS,
  SETTINGS_INPUT_CLASS,
  SETTINGS_SELECT_CLASS,
  SETTINGS_TEXTAREA_CLASS,
  SettingsField,
  SettingsFormActions,
  SettingsGroupLabel,
  SettingsSection,
  SettingsSubsection,
  settingsSectionId,
} from "./settings-ui";
import { SiteAccessSettingsPanel } from "./site-access-settings-panel";

const SETTINGS_PENDING_TIMEOUT_MS = 5000;

export const SETTINGS_FEATURE_ACCESS_SETTINGS =
  ADMIN_FEATURE_ACCESS_SETTINGS.filter(
    (setting) => setting.fieldName !== "webSearchAccessMode"
  );

// Top-level sections, in page order, for the "On this page" index.
const SETTINGS_SECTION_INDEX = [
  { id: "prelaunch-access", label: "Site access" },
  ...[
    "Feature access",
    "Free message policy",
    "Image generation",
    "Languages",
    "Translate page",
    "Live Translation",
    "Home page shortcuts",
    "Public pages",
  ].map((label) => ({ id: settingsSectionId(label), label })),
];

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

function LanguageStatusPills({
  isActive,
  isDefault,
  syncUiLanguage,
}: {
  isActive: boolean;
  isDefault: boolean;
  syncUiLanguage?: boolean;
}) {
  return (
    <>
      <AdminStatusPill tone={isActive ? "success" : "neutral"}>
        {isActive ? "Active" : "Inactive"}
      </AdminStatusPill>
      {syncUiLanguage ? <AdminStatusPill tone="info">UI sync</AdminStatusPill> : null}
      {isDefault ? <AdminStatusPill tone="info">Default</AdminStatusPill> : null}
    </>
  );
}

function LanguageRowSummary({
  children,
  code,
  detail,
  name,
}: {
  children: ReactNode;
  code: string;
  detail?: ReactNode;
  name: string;
}) {
  return (
    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-sm">{name}</span>
          {children}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground text-xs">
          <span className="font-mono">{code}</span>
          {detail}
        </div>
      </div>
      <span className="shrink-0 text-muted-foreground text-xs group-open/row:hidden">
        Edit
      </span>
      <span className="hidden shrink-0 text-muted-foreground text-xs group-open/row:inline">
        Close
      </span>
    </summary>
  );
}

export function AdminSettingsView({
  data: settingsData,
  notice,
}: {
  data: AdminSettingsData;
  notice?: string;
}) {
  const {
    appSettingReadSource,
    featureAccessState,
    modelsRaw,
    modelConfigsLoadFailed,
    imageModels,
    imageModelConfigsLoadFailed,
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
  } = settingsData;
  const featureAccessControlStateByField = new Map(
    SETTINGS_FEATURE_ACCESS_SETTINGS.map((setting) => [
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
    imageModelConfigsLoadFailed ? "image model configs" : null,
    languagesLoadFailed ? "languages" : null,
    translationFeatureLanguagesLoadFailed
      ? "translation feature languages"
      : null,
  ].filter((section): section is string => Boolean(section));

  const activeModels = modelsRaw.filter((model) => !model.deletedAt);
  const activeImageModels = imageModels.filter((model) => !model.deletedAt);
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
  const siteWebLaunched = resolvePublicLaunchedSetting({
    fallback: true,
    legacyMode: siteLegacyLaunchMode,
    value: siteWebLaunchedSetting,
  });
  const siteMobileAppLaunched = parseBooleanSetting(
    siteMobileAppLaunchedSetting,
    false
  );
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
  const imageWebReferencesAccessState =
    featureAccessControlStateByField.get("imageWebReferencesAccessMode") ??
    resolveFeatureAccessControlState({
      settingKey: IMAGE_WEB_REFERENCES_FEATURE_FLAG_KEY,
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
  const imageWebReferencesAccessMode = imageWebReferencesAccessState.mode;
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

  const featureRow = "px-4 py-4 sm:px-5";

  return (
    <>
      <div className="mb-6 flex flex-col gap-4">
        <AdminPageHeader
          description="Site access, features, models, languages and public page content."
          navHref="/admin/settings"
          title="Settings"
        />
        <AdminSectionIndex items={SETTINGS_SECTION_INDEX} />
      </div>
      <AdminSettingsNotice notice={notice} />

      {!featureSettingsReadConfirmed ? (
        <AdminNotice className="mb-4">
          <p className="font-medium">Feature settings loaded in fallback mode.</p>
          <p className="mt-1 text-xs leading-relaxed opacity-90">
            The dedicated feature access query timed out or returned stale
            data, so feature controls show their exact read state instead of
            pretending fallback defaults are saved database values. Retry in a
            few seconds and check server logs for
            <span className="mx-1 font-mono">[feature-settings]</span>
            entries if this persists.
          </p>
        </AdminNotice>
      ) : null}

      {degradedSettingsSections.length > 0 ? (
        <AdminNotice className="mb-4" tone="danger">
          <p className="font-medium">
            Some settings sections could not be confirmed.
          </p>
          <p className="mt-1 text-xs leading-relaxed opacity-90">
            Failed sections: {degradedSettingsSections.join(", ")}. Existing
            values were not replaced with confirmed empty data; refresh this
            page before editing those sections.
          </p>
        </AdminNotice>
      ) : null}

      <div className="flex flex-col gap-4">
        <SettingsSection
          defaultOpen
          description="Control whether the site is publicly available, temporarily under maintenance, or open to invited users only."
          icon={ShieldCheck}
          id="prelaunch-access"
          title="Site access and maintenance"
        >
          <SettingsSubsection
            description={
              <EditableTranslation
                defaultText="Each switch saves immediately and applies to non-admin visitors."
                description="Admin settings: explains that site access switches save immediately."
                translationKey="admin.settings.site_access.section_description"
              />
            }
            title={
              <EditableTranslation
                defaultText="Launch and access"
                description="Admin settings: heading above the web/mobile launch and maintenance switches."
                translationKey="admin.settings.site_access.section_title"
              />
            }
          >
            <SiteAccessSettingsPanel
              initialState={{
                webLaunched: siteWebLaunched,
                mobileAppLaunched: siteMobileAppLaunched,
                underMaintenance: siteUnderMaintenance,
                inviteOnlyPrelaunch: sitePrelaunchInviteOnly,
                adminAccessEnabled: siteAdminEntryEnabled,
                adminEntryPath: siteAdminEntryPath,
                adminEntryCodeConfigured: siteAdminEntryCodeConfigured,
              }}
            />
          </SettingsSubsection>

          <SettingsSubsection>
            <PrelaunchInvitesPanel
              appBaseUrl={appBaseUrl}
            />
          </SettingsSubsection>

          <SettingsSubsection
            description="Shown to visitors while the site is not launched."
            title={
              <EditableTranslation
                defaultText="Coming soon page"
                description="Admin settings: heading above the coming-soon page text and timer forms."
                translationKey="admin.settings.coming_soon.section_title"
              />
            }
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <form
                action={updateComingSoonContentAction}
                className="grid content-start gap-4"
              >
                <SettingsField htmlFor="comingSoonTitle" label="Coming soon title">
                  <input
                    className={SETTINGS_INPUT_CLASS}
                    defaultValue={comingSoonContent.title}
                    id="comingSoonTitle"
                    name="comingSoonTitle"
                    placeholder="Coming Soon"
                  />
                </SettingsField>
                <SettingsField
                  help="Controls the centered text shown on the coming-soon page."
                  htmlFor="comingSoonEyebrow"
                  label="Supporting text"
                >
                  <input
                    className={SETTINGS_INPUT_CLASS}
                    defaultValue={comingSoonContent.eyebrow}
                    id="comingSoonEyebrow"
                    name="comingSoonEyebrow"
                    placeholder="There Will Be Something Very Awesome"
                  />
                </SettingsField>
                <SettingsFormActions>
                  <SettingsSubmitButton
                    pendingLabel="Saving..."
                    successMessage="Coming soon content updated."
                  >
                    Save content
                  </SettingsSubmitButton>
                </SettingsFormActions>
              </form>

              <form
                action={updateComingSoonTimerAction}
                className="grid content-start gap-4 sm:grid-cols-2"
              >
                <SettingsField htmlFor="comingSoonTimerMode" label="Timer mode">
                  <select
                    className={SETTINGS_SELECT_CLASS}
                    defaultValue={comingSoonTimer.mode}
                    id="comingSoonTimerMode"
                    name="comingSoonTimerMode"
                  >
                    <option value="countdown">Countdown to date (future)</option>
                    <option value="countup">Count up since date (timeline)</option>
                  </select>
                </SettingsField>
                <SettingsField
                  htmlFor="comingSoonTimerReferenceAt"
                  label="Reference date/time"
                >
                  <input
                    className={SETTINGS_INPUT_CLASS}
                    defaultValue={toDateTimeLocalInputValue(
                      comingSoonTimer.referenceIso
                    )}
                    id="comingSoonTimerReferenceAt"
                    name="comingSoonTimerReferenceAt"
                    required
                    type="datetime-local"
                  />
                </SettingsField>
                <SettingsField
                  className="sm:col-span-2"
                  help={
                    <>
                      Example: &quot;Launching in&quot; for countdown, or
                      &quot;Has been building for&quot; for timeline mode.
                    </>
                  }
                  htmlFor="comingSoonTimerLabel"
                  label="Timer label"
                >
                  <input
                    className={SETTINGS_INPUT_CLASS}
                    defaultValue={comingSoonTimer.label}
                    id="comingSoonTimerLabel"
                    name="comingSoonTimerLabel"
                    placeholder="Has been building for"
                  />
                </SettingsField>
                <SettingsFormActions className="sm:col-span-2">
                  <SettingsSubmitButton
                    pendingLabel="Saving..."
                    successMessage="Coming soon timer updated."
                  >
                    Save timer
                  </SettingsSubmitButton>
                </SettingsFormActions>
              </form>
            </div>
          </SettingsSubsection>
        </SettingsSection>

        <SettingsSection
          description="Control access to optional, user-facing experiences."
          icon={ToggleRight}
          title="Feature access"
        >
          <SettingsSubsection className="py-4">
            <p className="max-w-3xl text-muted-foreground text-xs leading-relaxed">
              <EditableTranslation
                defaultText="Each feature has three modes: Off hides it from everyone, Admin only limits it to admin accounts, and Everyone makes it available to all users. Changes save immediately."
                description="Admin settings: legend explaining the three feature access modes."
                translationKey="admin.settings.features.legend"
              />{" "}
              <Link
                className="cursor-pointer font-medium text-primary underline-offset-2 hover:underline"
                href="/admin/coupons"
              >
                <EditableTranslation
                  defaultText="Manage creator referrals"
                  description="Admin settings: link from feature access to the coupons and creator referrals page."
                  translationKey="admin.settings.features.referrals_link"
                />
              </Link>
            </p>
          </SettingsSubsection>

          <div>
            <SettingsGroupLabel>
              <EditableTranslation
                defaultText="Chat tools"
                description="Admin settings: group label for chat tool feature switches."
                translationKey="admin.settings.features.group.chat"
              />
            </SettingsGroupLabel>
            <div className="divide-y divide-border/60">
              <div className={featureRow}>
                <FeatureAccessModeControl
                  currentMode={calculatorAccessMode}
                  description="Show or hide the calculator tool in sidebar navigation. When disabled, direct route access returns a 404."
                  fieldName="calculatorAccessMode"
                  readState={calculatorAccessState.readState}
                  successMessage="Calculator availability updated."
                  title="Calculator"
                />
              </div>
              <div className={featureRow}>
                <FeatureAccessModeControl
                  currentMode={studyModeAccessMode}
                  description="Show or hide the guided Study chat experience for exam question papers."
                  fieldName="studyModeAccessMode"
                  readState={studyModeAccessState.readState}
                  successMessage="Study mode availability updated."
                  title="Study mode"
                />
              </div>
              <div className={featureRow}>
                <FeatureAccessModeControl
                  currentMode={translateAccessMode}
                  description="Show or hide the Translate page and sidebar entry. When disabled, end users cannot access translation routes."
                  fieldName="translateAccessMode"
                  readState={translateAccessState.readState}
                  successMessage="Translate availability updated."
                  title="Translate"
                />
              </div>
              <div className={featureRow}>
                <FeatureAccessModeControl
                  currentMode={jobsAccessMode}
                  description="Show or hide the Jobs experience for browsing uploaded job postings."
                  fieldName="jobsAccessMode"
                  readState={jobsAccessState.readState}
                  successMessage="Jobs mode availability updated."
                  title="Jobs mode"
                />
              </div>
              <div className={featureRow}>
                <FeatureAccessModeControl
                  currentMode={newsAccessMode}
                  description="Show or hide the current News chat experience. News also requires Web Search access for the same user."
                  fieldName="newsAccessMode"
                  readState={newsAccessState.readState}
                  successMessage="News availability updated."
                  title="News"
                />
              </div>
              <div className={featureRow}>
                <FeatureAccessModeControl
                  currentMode={documentUploadsAccessMode}
                  description="Allow users to upload PDF and DOCX files in chat."
                  fieldName="documentUploadsAccessMode"
                  readState={documentUploadsAccessState.readState}
                  successMessage="Document upload availability updated."
                  title="Document uploads"
                />
              </div>
              <div className={featureRow}>
                <FeatureAccessModeControl
                  currentMode={exploreMeghalayaAccessMode}
                  description="Show or hide the location-aware Nearby discovery experience on web and Android."
                  fieldName="exploreMeghalayaAccessMode"
                  readState={exploreMeghalayaAccessState.readState}
                  successMessage="Nearby availability updated."
                  title="Nearby"
                />
              </div>
            </div>
          </div>

          <div>
            <SettingsGroupLabel>
              <EditableTranslation
                defaultText="Images"
                description="Admin settings: group label for image feature switches."
                translationKey="admin.settings.features.group.images"
              />
            </SettingsGroupLabel>
            <div className="divide-y divide-border/60">
              <div className={featureRow}>
                <FeatureAccessModeControl
                  currentMode={imageGenerationAccessMode}
                  description="Show or hide the image generation entry points across the chat experience."
                  fieldName="imageGenerationAccessMode"
                  readState={imageGenerationAccessState.readState}
                  successMessage="Image generation availability updated."
                  title="AI image generation"
                />
              </div>
              <div className={featureRow}>
                <FeatureAccessModeControl
                  currentMode={imageWebReferencesAccessMode}
                  description="Allow image generation to find temporary web visual references for specific real-world places and landmarks. Person identity continues to use Admin character references only."
                  fieldName="imageWebReferencesAccessMode"
                  readState={imageWebReferencesAccessState.readState}
                  successMessage="Automatic web visual reference availability updated."
                  title="Automatic web visual references"
                />
              </div>
            </div>
          </div>

          <div>
            <SettingsGroupLabel>
              <EditableTranslation
                defaultText="Voice and live translation"
                description="Admin settings: group label for voice chat and live translation feature switches."
                translationKey="admin.settings.features.group.voice"
              />
            </SettingsGroupLabel>
            <div className="divide-y divide-border/60">
              <div className={featureRow}>
                <FeatureAccessModeControl
                  currentMode={voiceChatAndroidAccessMode}
                  description="Allow Android native users to talk to chat with Gemini Live voice."
                  fieldName="voiceChatAndroidAccessMode"
                  readState={voiceChatAndroidReadState}
                  successMessage="Android voice chat availability updated."
                  title="Voice chat - Android"
                />
              </div>
              <div className={featureRow}>
                <FeatureAccessModeControl
                  currentMode={voiceChatWebAccessMode}
                  description="Allow web users to talk to chat with Gemini Live voice from supported browsers."
                  fieldName="voiceChatWebAccessMode"
                  readState={voiceChatWebReadState}
                  successMessage="Web voice chat availability updated."
                  title="Voice chat - Web"
                />
              </div>
              <div className={featureRow}>
                <FeatureAccessModeControl
                  currentMode={liveTranslationAndroidAccessMode}
                  description="Allow Android native users to use Gemini Live as a voice-to-voice interpreter."
                  fieldName="liveTranslationAndroidAccessMode"
                  readState={liveTranslationAndroidAccessState.readState}
                  successMessage="Android Live Translation availability updated."
                  title="Live Translation - Android"
                />
              </div>
              <div className={featureRow}>
                <FeatureAccessModeControl
                  currentMode={liveTranslationWebAccessMode}
                  description="Allow web users to use Gemini Live as a voice-to-voice interpreter from supported browsers."
                  fieldName="liveTranslationWebAccessMode"
                  readState={liveTranslationWebAccessState.readState}
                  successMessage="Web Live Translation availability updated."
                  title="Live Translation - Web"
                />
              </div>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection
          description="Choose whether complimentary daily messages come from each model or a single global allowance."
          icon={MessageSquareText}
          meta={
            <AdminStatusPill>
              {isGlobalFreeMessageMode ? (
                <EditableTranslation
                  defaultText="{count} per day for all models"
                  description="Admin settings: free message policy summary when one global allowance is active."
                  translationKey="admin.settings.free_messages.summary_global"
                  values={{ count: freeMessageSettings.globalLimit.toLocaleString() }}
                />
              ) : (
                <EditableTranslation
                  defaultText="Per-model allowances"
                  description="Admin settings: free message policy summary when each model has its own allowance."
                  translationKey="admin.settings.free_messages.summary_per_model"
                />
              )}
            </AdminStatusPill>
          }
          title="Free message policy"
        >
          <SettingsSubsection>
            <form
              action={updateFreeMessageSettingsAction}
              className="grid gap-6 md:grid-cols-2"
            >
              <fieldset className="space-y-2">
                <legend className="mb-2 font-medium text-sm">Allowance mode</legend>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-sm transition hover:bg-muted/40 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5">
                  <input
                    className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
                    defaultChecked={freeMessageSettings.mode === "per-model"}
                    name="mode"
                    type="radio"
                    value="per-model"
                  />
                  <span>
                    <span className="block font-medium">Per model allowances</span>
                    <span className="block text-muted-foreground text-xs">
                      Each model can define its own complimentary daily messages.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-sm transition hover:bg-muted/40 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5">
                  <input
                    className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
                    defaultChecked={freeMessageSettings.mode === "global"}
                    name="mode"
                    type="radio"
                    value="global"
                  />
                  <span>
                    <span className="block font-medium">One limit for all models</span>
                    <span className="block text-muted-foreground text-xs">
                      Override per-model allowances and use the global value
                      below.
                    </span>
                  </span>
                </label>
              </fieldset>
              <div className="flex flex-col gap-4">
                <SettingsField
                  help={
                    <>
                      Used only when &ldquo;One limit for all models&rdquo; is
                      selected.
                    </>
                  }
                  htmlFor="globalLimit"
                  label="Global daily free messages"
                >
                  <input
                    className={SETTINGS_INPUT_CLASS}
                    defaultValue={freeMessageSettings.globalLimit}
                    id="globalLimit"
                    min={0}
                    name="globalLimit"
                    step={1}
                    type="number"
                  />
                </SettingsField>
                {isGlobalFreeMessageMode ? (
                  <AdminNotice tone="info">
                    Per-model inputs are locked because a global allowance of{" "}
                    {freeMessageSettings.globalLimit.toLocaleString()} messages
                    per day is active.
                  </AdminNotice>
                ) : null}
              </div>
              <SettingsFormActions className="md:col-span-2">
                <SettingsSubmitButton
                  pendingLabel="Saving..."
                  refreshOnSuccess={true}
                  successMessage="Free message policy updated."
                >
                  Save policy
                </SettingsSubmitButton>
              </SettingsFormActions>
            </form>
          </SettingsSubsection>
        </SettingsSection>

        <SettingsSection
          description="Choose which enabled image model handles new generations and set download defaults. Detailed pricing and model editing stay in Admin Pricing."
          icon={ImageIcon}
          meta={
            <AdminStatusPill>
              <EditableTranslation
                defaultText="{count} models"
                description="Admin settings: number of configured image models."
                translationKey="admin.settings.image_models.count"
                values={{ count: activeImageModels.length }}
              />
            </AdminStatusPill>
          }
          title="Image generation"
        >
          <SettingsSubsection
            title={
              <EditableTranslation
                defaultText="Active image model"
                description="Admin settings: heading above the list of image models that can be set as active."
                translationKey="admin.settings.image_model.section_title"
              />
            }
          >
            <ImageModelActivationProvider
              initialActiveId={
                activeImageModels.find((model) => model.isActive)?.id ?? null
              }
            >
              {activeImageModels.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No image models are configured yet.
                </p>
              ) : (
                <ul className="divide-y divide-border/60 rounded-lg border">
                  {activeImageModels.map((model) => (
                    <li
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                      key={model.id}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-sm">
                            {model.displayName}
                          </span>
                          <ImageModelActiveBadge modelId={model.id} />
                        </div>
                        <span className="break-all font-mono text-muted-foreground text-xs">
                          {model.providerModelId}
                        </span>
                      </div>
                      <ImageModelActivationButton modelId={model.id} />
                    </li>
                  ))}
                </ul>
              )}
            </ImageModelActivationProvider>
          </SettingsSubsection>

          <SettingsSubsection
            title={
              <EditableTranslation
                defaultText="Download defaults"
                description="Admin settings: heading above the generated image download filename form."
                translationKey="admin.settings.image_downloads.section_title"
              />
            }
          >
            <form
              action={updateImageFilenamePrefixAction}
              className="grid max-w-xl gap-4"
            >
              <SettingsField
                help="Leave blank to use the default prefix in generated image downloads."
                htmlFor="imageFilenamePrefix"
                label="Download filename prefix"
              >
                <input
                  className={SETTINGS_INPUT_CLASS}
                  defaultValue={imageFilenamePrefix}
                  id="imageFilenamePrefix"
                  name="imageFilenamePrefix"
                  placeholder="nano-banana"
                />
              </SettingsField>
              <SettingsFormActions>
                <SettingsSubmitButton
                  pendingLabel="Saving..."
                  successMessage="Image filename prefix updated."
                >
                  Save defaults
                </SettingsSubmitButton>
              </SettingsFormActions>
            </form>
          </SettingsSubsection>
        </SettingsSection>

        <SettingsSection
          description="Manage supported chat languages, per-language system prompts, and UI sync behavior. The default language must stay active."
          icon={Globe}
          meta={
            languagesLoadFailed ? null : (
              <AdminStatusPill>
                <EditableTranslation
                  defaultText="{count} languages"
                  description="Admin settings: number of configured languages."
                  translationKey="admin.settings.languages.count"
                  values={{ count: languages.length }}
                />
              </AdminStatusPill>
            )
          }
          title="Languages"
        >
          <SettingsSubsection>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
              <form
                action={createLanguageAction}
                className="order-2 flex flex-col gap-4 self-start rounded-lg bg-muted/40 p-4 lg:order-1"
              >
                <h3 className="font-semibold text-sm">
                  <EditableTranslation
                    defaultText="Add a language"
                    description="Admin settings: heading of the form that adds a chat language."
                    translationKey="admin.settings.languages.add_title"
                  />
                </h3>
                <SettingsField htmlFor="language-code" label="Language code">
                  <input
                    className={SETTINGS_INPUT_CLASS}
                    id="language-code"
                    name="code"
                    pattern="[a-z0-9-]{2,16}"
                    placeholder="fr"
                    required
                    title="Use 2-16 lowercase letters, numbers, or hyphens."
                  />
                </SettingsField>
                <SettingsField htmlFor="language-name" label="Language name">
                  <input
                    className={SETTINGS_INPUT_CLASS}
                    id="language-name"
                    name="name"
                    placeholder="French"
                    required
                  />
                </SettingsField>
                <SettingsField
                  help="Appended to the selected model prompt when this language is chosen."
                  htmlFor="language-system-prompt"
                  label="Language system prompt"
                >
                  <textarea
                    className={SETTINGS_TEXTAREA_CLASS}
                    id="language-system-prompt"
                    name="systemPrompt"
                    placeholder="e.g., Respond in French unless the user asks otherwise."
                  />
                </SettingsField>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    className={SETTINGS_CHECKBOX_CLASS}
                    name="syncUiLanguage"
                    type="checkbox"
                  />
                  Change UI language when selected
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    className={SETTINGS_CHECKBOX_CLASS}
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
              <div className="order-1 min-w-0 space-y-3 lg:order-2">
                {languagesLoadFailed ? (
                  <AdminNotice tone="danger">
                    Language settings could not be loaded. This is not a
                    confirmed empty language list; refresh before editing
                    language-specific settings.
                  </AdminNotice>
                ) : languages.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
                    No languages configured yet.
                  </p>
                ) : null}
                {languages.length > 0 ? (
                  <div className="divide-y divide-border/60 overflow-hidden rounded-lg border">
                    {languages.map((language) => (
                      <details className="group/row" key={language.id}>
                        <LanguageRowSummary code={language.code} name={language.name}>
                          <LanguageStatusPills
                            isActive={language.isActive}
                            isDefault={language.isDefault}
                            syncUiLanguage={language.syncUiLanguage}
                          />
                        </LanguageRowSummary>
                        <div className="space-y-4 border-t bg-muted/20 p-4">
                          <form
                            action={updateLanguageSettingsAction}
                            className="grid gap-4 md:grid-cols-2"
                          >
                            <input
                              name="languageId"
                              type="hidden"
                              value={language.id}
                            />
                            <SettingsField
                              htmlFor={`language-name-${language.id}`}
                              label="Display name"
                            >
                              <input
                                className={SETTINGS_INPUT_CLASS}
                                defaultValue={language.name}
                                id={`language-name-${language.id}`}
                                name="name"
                              />
                            </SettingsField>
                            <SettingsField
                              className="md:col-span-2"
                              help="This prompt is appended to the selected model prompt."
                              htmlFor={`language-prompt-${language.id}`}
                              label="System prompt"
                            >
                              <textarea
                                className={SETTINGS_TEXTAREA_CLASS}
                                defaultValue={language.systemPrompt ?? ""}
                                id={`language-prompt-${language.id}`}
                                name="systemPrompt"
                                placeholder="e.g., Respond in this language unless the user requests another."
                              />
                            </SettingsField>
                            <label className="flex cursor-pointer items-center gap-2 text-sm md:col-span-2">
                              <input
                                className={SETTINGS_CHECKBOX_CLASS}
                                defaultChecked={language.syncUiLanguage}
                                name="syncUiLanguage"
                                type="checkbox"
                              />
                              Change UI language when this language is selected
                            </label>
                            <SettingsFormActions className="md:col-span-2">
                              <SettingsSubmitButton pendingLabel="Saving...">
                                Save settings
                              </SettingsSubmitButton>
                            </SettingsFormActions>
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
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </SettingsSubsection>
        </SettingsSection>

        <SettingsSection
          description="Manage Translate-only target languages and choose whether translation runs through Google Translation API or the existing AI model flow."
          icon={Languages}
          meta={
            <AdminStatusPill tone={translateProviderMode === "google" ? "info" : "neutral"}>
              {translateProviderMode === "google"
                ? "Google Translation API"
                : "AI model-based translation"}
            </AdminStatusPill>
          }
          title="Translate page"
        >
          <SettingsSubsection>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <AdminNotice className="self-start" tone="info">
                <p className="font-medium">
                  Translation languages are separate from display languages.
                </p>
                <p className="mt-1 text-xs leading-relaxed opacity-90">
                  Active translation languages appear on the Translate page.
                  Google mode ignores model and prompt settings. AI mode uses the
                  configured model and system prompt for each language.
                </p>
              </AdminNotice>
              <form
                action={updateTranslateProviderModeAction}
                className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
              >
                <SettingsField
                  htmlFor="translate-provider-mode"
                  label="Translation provider mode"
                >
                  <select
                    className={SETTINGS_SELECT_CLASS}
                    defaultValue={translateProviderMode}
                    id="translate-provider-mode"
                    name="translateProviderMode"
                  >
                    <option value="google">Google Translation API</option>
                    <option value="ai">AI model-based translation</option>
                  </select>
                </SettingsField>
                <SettingsSubmitButton pendingLabel="Saving...">
                  Save provider mode
                </SettingsSubmitButton>
                <p className="text-muted-foreground text-xs leading-relaxed sm:col-span-2">
                  Google mode uses Google Translation API for text and the
                  browser speech-recognition transcript flow for voice. AI mode
                  uses the admin-selected translation model and per-language
                  system prompt.
                </p>
              </form>
            </div>
          </SettingsSubsection>

          <SettingsSubsection>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
              <form
                action={createTranslationFeatureLanguageAction}
                className="order-2 flex flex-col gap-4 self-start rounded-lg bg-muted/40 p-4 lg:order-1"
              >
                <h3 className="font-semibold text-sm">
                  <EditableTranslation
                    defaultText="Add a translation language"
                    description="Admin settings: heading of the form that adds a Translate page target language."
                    translationKey="admin.settings.translation_languages.add_title"
                  />
                </h3>
                <SettingsField
                  htmlFor="translation-feature-language-code"
                  label="Translation language code"
                >
                  <input
                    className={SETTINGS_INPUT_CLASS}
                    id="translation-feature-language-code"
                    name="code"
                    pattern="[a-z0-9-]{2,16}"
                    placeholder="fr"
                    required
                    title="Use 2-16 lowercase letters, numbers, or hyphens."
                  />
                </SettingsField>
                <SettingsField
                  htmlFor="translation-feature-language-name"
                  label="Translation language name"
                >
                  <input
                    className={SETTINGS_INPUT_CLASS}
                    id="translation-feature-language-name"
                    name="name"
                    placeholder="French"
                    required
                  />
                </SettingsField>
                <SettingsField
                  help={
                    translateProviderMode === "google"
                      ? "Ignored in Google mode."
                      : "This model is used for text translation and live speech translation when AI mode is selected."
                  }
                  htmlFor="translation-feature-language-model"
                  label="Text translation model"
                >
                  <select
                    className={SETTINGS_SELECT_CLASS}
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
                </SettingsField>
                <SettingsField
                  help={
                    translateProviderMode === "google"
                      ? "Ignored in Google mode."
                      : enabledLiveSpeechModels.length > 0
                        ? "Optional. Configure an enabled Google live/native-audio model here to power true live speech. If left blank, the Translate page falls back to browser speech recognition."
                        : "No enabled Google live/native-audio models are available. The Translate page will use browser speech recognition only."
                  }
                  htmlFor="translation-feature-language-speech-model"
                  label="Speech/live model"
                >
                  <select
                    className={SETTINGS_SELECT_CLASS}
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
                </SettingsField>
                <SettingsField
                  help={
                    translateProviderMode === "google"
                      ? "Ignored in Google mode."
                      : "This is a standalone translation prompt used only when this language is the translation target. It does not combine with the model's main system prompt."
                  }
                  htmlFor="translation-feature-language-prompt"
                  label="Translation system prompt"
                >
                  <textarea
                    className={SETTINGS_TEXTAREA_CLASS}
                    disabled={translateProviderMode === "google"}
                    id="translation-feature-language-prompt"
                    name="systemPrompt"
                    placeholder="e.g., Translate into French naturally and preserve the original formatting."
                  />
                </SettingsField>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    className={SETTINGS_CHECKBOX_CLASS}
                    defaultChecked
                    name="isActive"
                    type="checkbox"
                  />
                  Active immediately
                </label>
                {translateProviderMode === "ai" && enabledModels.length === 0 ? (
                  <AdminNotice>
                    Add and enable at least one model before creating
                    translation languages.
                  </AdminNotice>
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

              <div className="order-1 min-w-0 space-y-3 lg:order-2">
                {activeTranslationFeatureLanguages.length === 0 ? (
                  <AdminNotice>
                    No active translation languages are configured. End users
                    will see an empty target-language list until at least one
                    translation language is active.
                  </AdminNotice>
                ) : null}
                {translationFeatureLanguageRows.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
                    No translation languages configured yet.
                  </p>
                ) : (
                  <div className="divide-y divide-border/60 overflow-hidden rounded-lg border">
                    {translationFeatureLanguageRows.map((language) => {
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
                        <details className="group/row" key={language.id}>
                          <LanguageRowSummary
                            code={language.code}
                            detail={
                              <>
                                <span>Text: {modelName}</span>
                                <span>Speech: {speechModelName}</span>
                              </>
                            }
                            name={language.name}
                          >
                            <LanguageStatusPills
                              isActive={language.isActive}
                              isDefault={language.isDefault}
                            />
                          </LanguageRowSummary>
                          <div className="space-y-4 border-t bg-muted/20 p-4">
                            <form
                              action={updateTranslationFeatureLanguageSettingsAction}
                              className="grid gap-4 md:grid-cols-2"
                            >
                              <input
                                name="languageId"
                                type="hidden"
                                value={language.id}
                              />
                              <SettingsField
                                htmlFor={`translation-feature-language-code-${language.id}`}
                                label="Language code"
                              >
                                <input
                                  className={SETTINGS_INPUT_CLASS}
                                  defaultValue={language.code}
                                  id={`translation-feature-language-code-${language.id}`}
                                  name="code"
                                  pattern="[a-z0-9-]{2,16}"
                                  required
                                />
                              </SettingsField>
                              <SettingsField
                                htmlFor={`translation-feature-language-name-${language.id}`}
                                label="Display name"
                              >
                                <input
                                  className={SETTINGS_INPUT_CLASS}
                                  defaultValue={language.name}
                                  id={`translation-feature-language-name-${language.id}`}
                                  name="name"
                                  required
                                />
                              </SettingsField>
                              <SettingsField
                                className="md:col-span-2"
                                help={
                                  translateProviderMode === "google"
                                    ? "Ignored in Google mode."
                                    : `This exact model will be used for text translation into ${language.name}.`
                                }
                                htmlFor={`translation-feature-language-model-${language.id}`}
                                label="Text translation model"
                              >
                                <select
                                  className={SETTINGS_SELECT_CLASS}
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
                              </SettingsField>
                              <SettingsField
                                className="md:col-span-2"
                                help={
                                  translateProviderMode === "google"
                                    ? "Ignored in Google mode."
                                    : enabledLiveSpeechModels.length > 0
                                      ? "Optional. Use a dedicated Google live/native-audio model here only for AI mode voice translation."
                                      : "No enabled Google live/native-audio models are available. Saving will keep browser speech fallback only."
                                }
                                htmlFor={`translation-feature-language-speech-model-${language.id}`}
                                label="Speech/live model"
                              >
                                <select
                                  className={SETTINGS_SELECT_CLASS}
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
                              </SettingsField>
                              <SettingsField
                                className="md:col-span-2"
                                help={
                                  translateProviderMode === "google"
                                    ? "Ignored in Google mode."
                                    : "This is a standalone translation prompt for this language only. It does not combine with the model's main system prompt."
                                }
                                htmlFor={`translation-feature-language-prompt-${language.id}`}
                                label="System prompt"
                              >
                                <textarea
                                  className={SETTINGS_TEXTAREA_CLASS}
                                  defaultValue={language.systemPrompt ?? ""}
                                  disabled={translateProviderMode === "google"}
                                  id={`translation-feature-language-prompt-${language.id}`}
                                  name="systemPrompt"
                                  placeholder="e.g., Translate naturally and preserve formatting."
                                />
                              </SettingsField>
                              <SettingsFormActions className="md:col-span-2">
                                <SettingsSubmitButton
                                  disabled={
                                    translateProviderMode === "ai" &&
                                    enabledModels.length === 0
                                  }
                                  pendingLabel="Saving..."
                                >
                                  Save settings
                                </SettingsSubmitButton>
                              </SettingsFormActions>
                            </form>
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                              {language.isDefault ? (
                                <span className="text-muted-foreground text-xs">
                                  Default translation language cannot be
                                  deactivated or removed.
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
                )}
              </div>
            </div>
          </SettingsSubsection>
        </SettingsSection>

        <SettingsSection
          description="Configure the language pair and interpreter behavior used by the Live Translation page."
          icon={AudioLines}
          title="Live Translation"
        >
          <SettingsSubsection>
            <form
              action={updateLiveTranslationSettingsAction}
              className="grid gap-4 md:grid-cols-2"
            >
              <SettingsField
                className="md:col-span-2"
                help="One language per line as code|Name. Keep auto|Auto Detect for the common Auto Detect to Khasi flow."
                htmlFor="liveTranslationSupportedLanguages"
                label="Supported languages"
              >
                <textarea
                  className={`${SETTINGS_TEXTAREA_CLASS} font-mono text-xs`}
                  defaultValue={serializeLiveTranslationLanguagesText(
                    liveTranslationLanguages
                  )}
                  id="liveTranslationSupportedLanguages"
                  name="liveTranslationSupportedLanguages"
                />
              </SettingsField>
              <SettingsField
                htmlFor="liveTranslationDefaultLanguageA"
                label="Default Language A"
              >
                <select
                  className={SETTINGS_SELECT_CLASS}
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
              </SettingsField>
              <SettingsField
                htmlFor="liveTranslationDefaultLanguageB"
                label="Default Language B"
              >
                <select
                  className={SETTINGS_SELECT_CLASS}
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
              </SettingsField>
              <SettingsField
                className="md:col-span-2"
                help="These instructions are combined with the selected language pair at session start. Live voice model settings still control model, voice, platform, and credit multiplier."
                htmlFor="liveTranslationSystemInstruction"
                label="Interpreter system instructions"
              >
                <textarea
                  className={`${SETTINGS_TEXTAREA_CLASS} min-h-40`}
                  defaultValue={liveTranslationSystemInstruction}
                  id="liveTranslationSystemInstruction"
                  name="liveTranslationSystemInstruction"
                />
              </SettingsField>
              <SettingsFormActions className="md:col-span-2">
                <SettingsSubmitButton
                  pendingLabel="Saving..."
                  successMessage="Live Translation settings updated."
                >
                  Save Live Translation settings
                </SettingsSubmitButton>
              </SettingsFormActions>
            </form>
          </SettingsSubsection>
        </SettingsSection>

        <SettingsSection
          description="Control the quick-start prompts and icon shortcuts that appear on the home screen."
          icon={LayoutGrid}
          title="Home page shortcuts"
        >
          <SettingsSubsection
            description="Customize the quick-start prompts that appear on the home screen. Enter one prompt per line for each language."
            title="Suggested prompts"
          >
            <div className="flex flex-col gap-4">
              <FeatureAccessModeControl
                currentMode={suggestedPromptsAccessMode}
                description="Toggle the suggested prompt chips shown on the home page."
                fieldName="suggestedPromptsAccessMode"
                readState={suggestedPromptsAccessState.readState}
                successMessage="Suggested prompts updated."
                title="Suggested prompts"
              />
              {languagePromptConfigs.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
                  No active languages are configured. Add a language before
                  managing prompts.
                </p>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
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
          </SettingsSubsection>

          <SettingsSubsection
            description="Manage icon-based quick prompts displayed on the home screen."
            title="Icon pre-prompts"
          >
            <div className="flex flex-col gap-4">
              <FeatureAccessModeControl
                currentMode={iconPromptsAccessMode}
                description="Toggle the icon-based prompt section shown on the home page."
                fieldName="iconPromptsAccessMode"
                readState={iconPromptsAccessState.readState}
                successMessage="Icon pre-prompts updated."
                title="Icon pre-prompts"
              />
              {activeLanguagesList.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
                  No active languages are configured. Add a language before
                  managing icon prompts.
                </p>
              ) : (
                <IconPromptSettingsForm
                  initialItems={iconPromptSettings.items}
                  languages={activeLanguagesList}
                  models={activeModels.map((model) => ({
                    id: model.id,
                    isEnabled: model.isEnabled,
                    name: model.displayName,
                  }))}
                  onSubmit={updateIconPromptsAction}
                />
              )}
            </div>
          </SettingsSubsection>
        </SettingsSection>

        <SettingsSection
          description="Update the copy shown on the public About, Privacy Policy, and Terms of Service pages."
          icon={FileText}
          title="Public pages"
        >
          {activeLanguagesList.length === 0 ? (
            <SettingsSubsection>
              <p className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
                No active languages are configured. Add a language before
                managing public page content.
              </p>
            </SettingsSubsection>
          ) : (
            <>
              <SettingsSubsection title="About page content">
                <div className="grid gap-4 lg:grid-cols-2">
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
              </SettingsSubsection>

              <SettingsSubsection
                description={
                  <>
                    Appears at{" "}
                    <code className="rounded bg-muted px-1 py-0.5">
                      /privacy-policy
                    </code>
                    .
                  </>
                }
                title="Privacy policy content"
              >
                <div className="grid gap-4 lg:grid-cols-2">
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
              </SettingsSubsection>

              <SettingsSubsection
                description={
                  <>
                    Appears at{" "}
                    <code className="rounded bg-muted px-1 py-0.5">
                      /terms-of-service
                    </code>
                    .
                  </>
                }
                title="Terms of service content"
              >
                <div className="grid gap-4 lg:grid-cols-2">
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
              </SettingsSubsection>
            </>
          )}
        </SettingsSection>
      </div>
    </>
  );
}
