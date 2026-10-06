import {
  LIVE_TRANSLATION_ANDROID_FEATURE_FLAG_KEY,
  LIVE_TRANSLATION_WEB_FEATURE_FLAG_KEY,
  VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY,
  VOICE_CHAT_WEB_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import type { FeatureAccessMode, FeatureAccessRole } from "@/lib/feature-access";

// Direct live sessions currently report billable usage from the client.
// Keep them admin-only until trusted server metering replaces that contract.
// Disabled remains disabled; settings/fallbacks cannot open public access.
export function restrictUnmeteredLiveAccess(mode: FeatureAccessMode): FeatureAccessMode {
  return mode === "enabled" ? "admin_only" : mode;
}

const unmeteredLiveFeatureKeys = new Set<string>([LIVE_TRANSLATION_ANDROID_FEATURE_FLAG_KEY, LIVE_TRANSLATION_WEB_FEATURE_FLAG_KEY]);

export function isMeteredVoiceFeatureKey(key: string) {
  return key === VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY || key === VOICE_CHAT_WEB_FEATURE_FLAG_KEY;
}

export function isMeteredVoiceEnabledForRole(mode: FeatureAccessMode, role: FeatureAccessRole, override?: boolean | null) {
  return (role === "admin" || role === "regular") && override !== false && (mode === "enabled" || (mode === "admin_only" && role === "admin"));
}

export function isUnmeteredLiveFeatureKey(featureKey: string) {
  return unmeteredLiveFeatureKeys.has(featureKey);
}

// Per-user grants can narrow this launch restriction, never expand it.
export function isUnmeteredLiveEnabledForRole(mode: FeatureAccessMode, role: FeatureAccessRole, override?: boolean | null) {
  return role === "admin" && mode !== "disabled" && override !== false;
}
