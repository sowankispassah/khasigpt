import type {
  FeatureAccessMode,
  FeatureAccessRole,
} from "@/lib/feature-access";

export const FORUM_ACCESS_MODE_FALLBACK: FeatureAccessMode = "enabled";

export function parseForumEnabledSetting(_value: unknown): boolean {
  return true;
}

export function parseForumAccessModeSetting(_value: unknown): FeatureAccessMode {
  return "enabled";
}

export async function getForumAccessMode() {
  return "enabled" satisfies FeatureAccessMode;
}

export async function isForumEnabledForRole(_role: FeatureAccessRole) {
  return true;
}

export async function isForumEnabled() {
  return true;
}
