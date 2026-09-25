import {
  CALCULATOR_FEATURE_FLAG_KEY,
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
  VOICE_CHAT_WEB_FEATURE_FLAG_KEY,
  WEB_SEARCH_ENABLED_SETTING_KEY,
} from "@/lib/constants";
import type { FeatureAccessMode } from "@/lib/feature-access";

export type UserFeatureDefinition = {
  defaultDescription: string;
  defaultLabel: string;
  descriptionKey: string;
  fallbackMode: FeatureAccessMode;
  labelKey: string;
  settingKey: string;
};

export const USER_FEATURE_ACCESS_CATALOG = [
  [CALCULATOR_FEATURE_FLAG_KEY, "Calculator", "Use the calculator workspace.", "enabled"],
  [STUDY_MODE_FEATURE_FLAG_KEY, "Study mode", "Use study chats and learning tools.", "disabled"],
  [TRANSLATE_FEATURE_FLAG_KEY, "Translation", "Use text translation.", "disabled"],
  [JOBS_FEATURE_FLAG_KEY, "Jobs", "Browse job listings and job details.", "disabled"],
  [NEWS_FEATURE_FLAG_KEY, "News", "Browse the news experience.", "admin_only"],
  [IMAGE_GENERATION_FEATURE_FLAG_KEY, "Image generation", "Generate images in chat.", "disabled"],
  [IMAGE_WEB_REFERENCES_FEATURE_FLAG_KEY, "Image web references", "Use web references while creating images.", "admin_only"],
  [DOCUMENT_UPLOADS_FEATURE_FLAG_KEY, "Document uploads", "Upload supported documents to chat.", "disabled"],
  [EXPLORE_MEGHALAYA_FEATURE_FLAG_KEY, "Explore Meghalaya", "Use place discovery and local search.", "admin_only"],
  [VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY, "Voice chat on Android", "Use live voice chat in the Android app.", "disabled"],
  [VOICE_CHAT_WEB_FEATURE_FLAG_KEY, "Voice chat on web", "Use live voice chat in the web app.", "disabled"],
  [LIVE_TRANSLATION_ANDROID_FEATURE_FLAG_KEY, "Live translation on Android", "Use live translation in the Android app.", "admin_only"],
  [LIVE_TRANSLATION_WEB_FEATURE_FLAG_KEY, "Live translation on web", "Use live translation in the web app.", "admin_only"],
  [SUGGESTED_PROMPTS_ENABLED_SETTING_KEY, "Suggested prompts", "See suggested prompts on the home screen.", "enabled"],
  [ICON_PROMPTS_ENABLED_SETTING_KEY, "Shortcut prompts", "See configurable shortcut prompt actions.", "disabled"],
  [WEB_SEARCH_ENABLED_SETTING_KEY, "Web search", "Use grounded web search in chat.", "admin_only"],
] as const satisfies readonly (readonly [string, string, string, FeatureAccessMode])[];

export const USER_FEATURE_ACCESS_KEYS = USER_FEATURE_ACCESS_CATALOG.map(
  ([settingKey]) => settingKey
);

export const USER_FEATURE_DEFINITIONS: UserFeatureDefinition[] =
  USER_FEATURE_ACCESS_CATALOG.map(
    ([settingKey, defaultLabel, defaultDescription, fallbackMode]) => ({
      defaultDescription,
      defaultLabel,
      descriptionKey: `admin.users.feature_access.feature.${settingKey}.description`,
      fallbackMode,
      labelKey: `admin.users.feature_access.feature.${settingKey}.label`,
      settingKey,
    })
  );

const USER_FEATURE_ACCESS_KEY_SET = new Set<string>(USER_FEATURE_ACCESS_KEYS);

export function isUserFeatureAccessKey(value: string) {
  return USER_FEATURE_ACCESS_KEY_SET.has(value);
}
