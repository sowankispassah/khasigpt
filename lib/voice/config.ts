import {
  VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY,
  VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY,
  VOICE_CHAT_WEB_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import {
  type FeatureAccessMode,
  type FeatureAccessRole,
  isFeatureEnabledForRole,
  parseFeatureAccessMode,
} from "@/lib/feature-access";
import {
  getFeatureAccessModeSettingValue,
  loadFeatureAccessSettingsByKeys,
} from "@/lib/settings/feature-access-settings";

export const VOICE_CHAT_ACCESS_MODE_FALLBACK: FeatureAccessMode = "disabled";
const VOICE_CHAT_FEATURE_ACCESS_TIMEOUT_MS = 2_000;

export type VoiceChatPlatform = "android" | "web";

export function parseVoiceChatAccessModeSetting(
  value: unknown
): FeatureAccessMode {
  return parseFeatureAccessMode(value, VOICE_CHAT_ACCESS_MODE_FALLBACK);
}

export async function isVoiceChatEnabledForRole(role: FeatureAccessRole) {
  const mode = await getVoiceChatAccessModeForPlatform("android");
  return isFeatureEnabledForRole(mode, role);
}

export async function getVoiceChatAccessModeForPlatform(
  platform: VoiceChatPlatform
): Promise<FeatureAccessMode> {
  const platformKey =
    platform === "web"
      ? VOICE_CHAT_WEB_FEATURE_FLAG_KEY
      : VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY;
  const featureAccessSettings = await loadFeatureAccessSettingsByKeys(
    [platformKey, VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY],
    {
      source: `voice.config.${platform}.feature-access`,
      timeoutMs: VOICE_CHAT_FEATURE_ACCESS_TIMEOUT_MS,
    }
  );
  const rawPlatformValue = getFeatureAccessModeSettingValue(
    featureAccessSettings,
    platformKey
  );
  const rawLegacyValue = getFeatureAccessModeSettingValue(
    featureAccessSettings,
    VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY
  );

  if (
    rawPlatformValue === undefined &&
    rawLegacyValue === undefined &&
    featureAccessSettings.status === "unavailable"
  ) {
    return "enabled";
  }

  const resolved = resolvePlatformVoiceChatSetting({
    androidValue: platform === "android" ? rawPlatformValue : undefined,
    legacyValue: rawLegacyValue,
    webValue: platform === "web" ? rawPlatformValue : undefined,
  });
  const rawValue = platform === "web" ? resolved.web : resolved.android;
  return parseVoiceChatAccessModeSetting(rawValue);
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
