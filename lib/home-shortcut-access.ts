import "server-only";

import {
  getImageGenerationAvailability,
  parseImageGenerationAccessModeSetting,
} from "@/lib/ai/image-generation";
import { parseCalculatorAccessModeSetting } from "@/lib/calculator/config";
import {
  CALCULATOR_FEATURE_FLAG_KEY,
  IMAGE_GENERATION_FEATURE_FLAG_KEY,
  JOBS_FEATURE_FLAG_KEY,
  LIVE_TRANSLATION_ANDROID_FEATURE_FLAG_KEY,
  LIVE_TRANSLATION_WEB_FEATURE_FLAG_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
  TRANSLATE_FEATURE_FLAG_KEY,
  VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY,
  VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY,
  VOICE_CHAT_WEB_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import type { UserRole } from "@/lib/db/schema";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import {
  type HomeShortcutPlatform,
  type HomeShortcutTargetDefinition,
  isHomeShortcutTargetAvailableForPlatform,
  isRoleAllowedForHomeShortcutTarget,
} from "@/lib/home-shortcut-registry";
import { parseJobsAccessModeSetting } from "@/lib/jobs/config";
import { parseLiveTranslationAccessModeSetting } from "@/lib/live-translation/config";
import { parseStudyModeAccessModeSetting } from "@/lib/study/config";
import { parseTranslateAccessModeSetting } from "@/lib/translate/config";
import {
  parseVoiceChatAccessModeSetting,
  resolvePlatformVoiceChatSetting,
} from "@/lib/voice/config";

export async function isHomeShortcutTargetAvailable({
  platform,
  role,
  settings,
  target,
}: {
  platform: HomeShortcutPlatform;
  role: UserRole | null | undefined;
  settings: ReadonlyMap<string, unknown>;
  target: HomeShortcutTargetDefinition;
}) {
  if (!isHomeShortcutTargetAvailableForPlatform(target, platform)) {
    return false;
  }
  if (!isRoleAllowedForHomeShortcutTarget(target, role)) {
    return false;
  }

  switch (target.access) {
    case "always":
    case "creator_only":
      return true;
    case "calculator":
      return isFeatureEnabledForRole(
        parseCalculatorAccessModeSetting(
          settings.get(CALCULATOR_FEATURE_FLAG_KEY)
        ),
        role
      );
    case "image_generation": {
      if (
        !isFeatureEnabledForRole(
          parseImageGenerationAccessModeSetting(
            settings.get(IMAGE_GENERATION_FEATURE_FLAG_KEY)
          ),
          role
        )
      ) {
        return false;
      }
      const availability = await getImageGenerationAvailability({
        userRole: role,
      });
      return availability.enabled;
    }
    case "jobs":
      return isFeatureEnabledForRole(
        parseJobsAccessModeSetting(settings.get(JOBS_FEATURE_FLAG_KEY)),
        role
      );
    case "live_translation": {
      const settingKey =
        platform === "web"
          ? LIVE_TRANSLATION_WEB_FEATURE_FLAG_KEY
          : LIVE_TRANSLATION_ANDROID_FEATURE_FLAG_KEY;
      const mode = parseLiveTranslationAccessModeSetting(
        settings.get(settingKey)
      );
      return isFeatureEnabledForRole(mode, role);
    }
    case "study":
      return isFeatureEnabledForRole(
        parseStudyModeAccessModeSetting(
          settings.get(STUDY_MODE_FEATURE_FLAG_KEY)
        ),
        role
      );
    case "translate":
      return isFeatureEnabledForRole(
        parseTranslateAccessModeSetting(
          settings.get(TRANSLATE_FEATURE_FLAG_KEY)
        ),
        role
      );
    case "voice_chat": {
      const platformKey =
        platform === "web"
          ? VOICE_CHAT_WEB_FEATURE_FLAG_KEY
          : VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY;
      const resolved = resolvePlatformVoiceChatSetting({
        androidValue:
          platform === "android" ? settings.get(platformKey) : undefined,
        legacyValue: settings.get(VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY),
        webValue: platform === "web" ? settings.get(platformKey) : undefined,
      });
      const mode = parseVoiceChatAccessModeSetting(
        platform === "web" ? resolved.web : resolved.android
      );
      return isFeatureEnabledForRole(mode, role);
    }
  }
}
