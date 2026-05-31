import {
  CALCULATOR_FEATURE_FLAG_KEY,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  ICON_PROMPTS_ENABLED_SETTING_KEY,
  IMAGE_GENERATION_FEATURE_FLAG_KEY,
  JOBS_FEATURE_FLAG_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
  SUGGESTED_PROMPTS_ENABLED_SETTING_KEY,
  TRANSLATE_FEATURE_FLAG_KEY,
  VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY,
  VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY,
  VOICE_CHAT_WEB_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import {
  type FeatureAccessMode,
  parseFeatureAccessModeStrict,
} from "@/lib/feature-access";

export type FeatureSettingWriteContext = {
  actorId?: string | null;
  route?: string;
  source?: string;
};

const ALLOWED_FEATURE_SETTING_SOURCES: Record<string, Set<string>> = {
  [CALCULATOR_FEATURE_FLAG_KEY]: new Set(["feature.calculator.toggle"]),
  [STUDY_MODE_FEATURE_FLAG_KEY]: new Set(["feature.study_mode.toggle"]),
  [TRANSLATE_FEATURE_FLAG_KEY]: new Set(["feature.translate.toggle"]),
  [JOBS_FEATURE_FLAG_KEY]: new Set(["feature.jobs_mode.toggle"]),
  [IMAGE_GENERATION_FEATURE_FLAG_KEY]: new Set([
    "feature.image_generation.toggle",
  ]),
  [DOCUMENT_UPLOADS_FEATURE_FLAG_KEY]: new Set([
    "feature.document_uploads.toggle",
  ]),
  [SUGGESTED_PROMPTS_ENABLED_SETTING_KEY]: new Set([
    "feature.suggested_prompts.toggle",
  ]),
  [ICON_PROMPTS_ENABLED_SETTING_KEY]: new Set([
    "feature.icon_prompts.toggle",
  ]),
  [VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY]: new Set([
    "feature.voice_chat.android.toggle",
  ]),
  [VOICE_CHAT_WEB_FEATURE_FLAG_KEY]: new Set([
    "feature.voice_chat.web.toggle",
  ]),
  [VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY]: new Set([
    "feature.voice_chat.android.toggle",
    "feature.voice_chat.web.toggle",
  ]),
};

export const FEATURE_ACCESS_SETTING_KEYS = new Set(
  Object.keys(ALLOWED_FEATURE_SETTING_SOURCES)
);

export function isFeatureAccessSettingKey(key: string) {
  return FEATURE_ACCESS_SETTING_KEYS.has(key.trim());
}

function normalizeFeatureSettingValue(value: unknown): FeatureAccessMode {
  const mode = parseFeatureAccessModeStrict(value);
  if (!mode) {
    throw new Error("invalid_feature_access_value");
  }
  return mode;
}

function compactStack() {
  const stack = new Error().stack;
  if (!stack) {
    return null;
  }
  return stack
    .split("\n")
    .slice(3, 9)
    .map((line) => line.trim());
}

export function assertFeatureSettingWriteAllowed({
  context,
  key,
  previousValue,
  value,
  writer,
}: {
  context?: FeatureSettingWriteContext;
  key: string;
  previousValue: unknown;
  value: unknown;
  writer: string;
}) {
  const normalizedKey = key.trim();
  if (!isFeatureAccessSettingKey(normalizedKey)) {
    return;
  }

  const nextMode = normalizeFeatureSettingValue(value);
  const previousMode = parseFeatureAccessModeStrict(previousValue);
  const source = context?.source?.trim() ?? "";
  const allowedSources = ALLOWED_FEATURE_SETTING_SOURCES[normalizedKey];
  const allowed = source.length > 0 && allowedSources?.has(source);

  const logPayload = {
    actorId: context?.actorId ?? null,
    key: normalizedKey,
    newValue: nextMode,
    previousValue: previousMode,
    route: context?.route ?? null,
    source: source || null,
    stack: compactStack(),
    writer,
  };

  if (!allowed) {
    console.error("[feature-settings/write-blocked]", logPayload);
    throw new Error("unauthorized_feature_setting_write");
  }

  console.info("[feature-settings/write]", logPayload);
}
