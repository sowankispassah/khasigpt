import { VOICE_CHAT_FEATURE_FLAG_KEY } from "@/lib/constants";
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
  const rawValue = await getAppSetting<string | boolean | number>(
    VOICE_CHAT_FEATURE_FLAG_KEY
  );
  const mode = parseVoiceChatAccessModeSetting(rawValue);
  return isFeatureEnabledForRole(mode, role);
}
