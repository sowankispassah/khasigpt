import {
  VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY,
  VOICE_CHAT_FEATURE_FLAG_KEY,
  VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY,
  VOICE_CHAT_WEB_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import {
  type FeatureAccessMode,
  type FeatureAccessRole,
  isFeatureEnabledForRole,
  parseFeatureAccessMode,
} from "@/lib/feature-access";

export const VOICE_CHAT_ACCESS_MODE_FALLBACK: FeatureAccessMode = "disabled";

export function parseVoiceChatAccessModeSetting(
  value: unknown
): FeatureAccessMode {
  return parseFeatureAccessMode(value, VOICE_CHAT_ACCESS_MODE_FALLBACK);
}

export async function isVoiceChatEnabledForRole(role: FeatureAccessRole) {
  const [androidValue, legacyValue] = await Promise.all([
    getAppSetting<string | boolean | number>(VOICE_CHAT_FEATURE_FLAG_KEY),
    getAppSetting<string | boolean | number>(VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY),
  ]);
  const mode = parseVoiceChatAccessModeSetting(
    resolvePlatformVoiceChatSetting({
      androidValue,
      legacyValue,
    }).android
  );
  return isFeatureEnabledForRole(mode, role);
}

export function resolvePlatformVoiceChatSetting({
  androidValue,
  legacyValue,
  webValue,
}: {
  androidValue?: unknown;
  legacyValue?: unknown;
  webValue?: unknown;
}) {
  return {
    android:
      androidValue === undefined || androidValue === null
        ? legacyValue
        : androidValue,
    web: webValue === undefined || webValue === null ? legacyValue : webValue,
  };
}

export {
  VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY,
  VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY,
  VOICE_CHAT_WEB_FEATURE_FLAG_KEY,
};
