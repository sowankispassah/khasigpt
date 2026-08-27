import { cache } from "react";
import {
  CALCULATOR_FEATURE_FLAG_KEY,
  EXPLORE_MEGHALAYA_FEATURE_FLAG_KEY,
  ICON_PROMPTS_ENABLED_SETTING_KEY,
  ICON_PROMPTS_SETTING_KEY,
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
import {
  getLiteAppSettingsByKeysUncached,
} from "@/lib/db/app-settings-lite";
import {
  getLastKnownAppSettingsByKeys,
} from "@/lib/db/queries";
import type { UserRole } from "@/lib/db/schema";
import {
  type FeatureAccessMode,
  isFeatureEnabledForRole,
  parseFeatureAccessMode,
} from "@/lib/feature-access";
import { isHomeShortcutTargetAvailable } from "@/lib/home-shortcut-access";
import {
  getHomeShortcutTarget,
  type HomeShortcutActionType,
  type HomeShortcutPlatform,
  isHomeShortcutActionType,
} from "@/lib/home-shortcut-registry";
import { resolveLanguage } from "@/lib/i18n/languages";

export type IconPromptBehavior = "append" | "replace";

export type IconPromptSuggestion = {
  label: string;
  prompt: string;
  isEditable: boolean;
};

export type IconPromptItem = {
  actionType: HomeShortcutActionType;
  id: string;
  label: string;
  prompt: string;
  iconUrl: string | null;
  isActive: boolean;
  behavior: IconPromptBehavior;
  selectImageMode: boolean;
  showSuggestions: boolean;
  suggestions: string[];
  suggestionPrompts?: string[];
  suggestionEditable?: boolean[];
  labelByLanguage?: Record<string, string>;
  promptByLanguage?: Record<string, string>;
  suggestionsByLanguage?: Record<string, string[]>;
  suggestionPromptsByLanguage?: Record<string, string[]>;
  suggestionEditableByLanguage?: Record<string, boolean[]>;
  targetId: string | null;
};

export type IconPromptAction = {
  actionType: HomeShortcutActionType;
  id: string;
  label: string;
  prompt: string;
  iconUrl: string | null;
  behavior: IconPromptBehavior;
  selectImageMode: boolean;
  showSuggestions: boolean;
  suggestions: IconPromptSuggestion[];
  targetId: string | null;
};

function buildPromptSuggestions(
  prompts: Array<{ label: string; prompt?: string }>
): IconPromptSuggestion[] {
  return prompts.map((suggestion) => ({
    label: suggestion.label,
    prompt: suggestion.prompt ?? suggestion.label,
    isEditable: true,
  }));
}

type StoredIconPromptItem = {
  actionType?: unknown;
  id?: unknown;
  label?: unknown;
  prompt?: unknown;
  iconUrl?: unknown;
  isActive?: unknown;
  behavior?: unknown;
  selectImageMode?: unknown;
  showSuggestions?: unknown;
  suggestions?: unknown;
  suggestionPrompts?: unknown;
  suggestionEditable?: unknown;
  labelByLanguage?: unknown;
  promptByLanguage?: unknown;
  suggestionsByLanguage?: unknown;
  suggestionPromptsByLanguage?: unknown;
  suggestionEditableByLanguage?: unknown;
  targetId?: unknown;
};

type StoredIconPromptSettings = {
  items?: unknown;
};

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return fallback;
}

export const ICON_PROMPTS_ACCESS_MODE_FALLBACK: FeatureAccessMode = "disabled";

export function parseIconPromptsAccessModeSetting(
  value: unknown
): FeatureAccessMode {
  return parseFeatureAccessMode(value, ICON_PROMPTS_ACCESS_MODE_FALLBACK);
}

function normalizeLanguageMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const result: Record<string, string> = {};
  for (const [code, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (trimmed.length > 0) {
      result[code] = trimmed;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeStringArray(value: unknown) {
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function normalizeOptionalStringArray(value: unknown) {
  if (typeof value === "string") {
    return value.split(/\r?\n/).map((entry) => entry.trim());
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => (typeof entry === "string" ? entry.trim() : ""));
}

function normalizeBooleanArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    if (typeof entry === "boolean") {
      return entry;
    }
    if (typeof entry === "string") {
      return entry.toLowerCase() === "true";
    }
    return false;
  });
}

function normalizeSuggestionsMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const result: Record<string, string[]> = {};
  for (const [code, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalized = normalizeStringArray(entry);
    if (normalized.length > 0) {
      result[code] = normalized;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeOptionalSuggestionsMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const result: Record<string, string[]> = {};
  for (const [code, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalized = normalizeOptionalStringArray(entry);
    if (normalized.length > 0) {
      result[code] = normalized;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeOptionalBooleanMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const result: Record<string, boolean[]> = {};
  for (const [code, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalized = normalizeBooleanArray(entry);
    if (normalized.length > 0) {
      result[code] = normalized;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
function normalizeBehavior(value: unknown): IconPromptBehavior {
  return value === "append" ? "append" : "replace";
}

function normalizeActionType(value: unknown): HomeShortcutActionType {
  return isHomeShortcutActionType(value) ? value : "prompt";
}

export function normalizeIconPromptSettings(
  rawSettings: unknown,
  enabledSetting: unknown
) {
  const enabled = parseIconPromptsAccessModeSetting(enabledSetting) !== "disabled";
  const settings =
    rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings)
      ? (rawSettings as StoredIconPromptSettings)
      : {};
  const itemsRaw = Array.isArray(rawSettings)
    ? rawSettings
    : Array.isArray(settings.items)
      ? settings.items
      : [];

  const items: IconPromptItem[] = [];
  for (const raw of itemsRaw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const entry = raw as StoredIconPromptItem;
    const actionType = normalizeActionType(entry.actionType);
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    const prompt = typeof entry.prompt === "string" ? entry.prompt.trim() : "";
    const iconUrl =
      typeof entry.iconUrl === "string" && entry.iconUrl.trim().length > 0
        ? entry.iconUrl.trim()
        : null;
    const isActive =
      typeof entry.isActive === "boolean" ? entry.isActive : true;
    const behavior = normalizeBehavior(entry.behavior);
    const selectImageMode = normalizeBoolean(entry.selectImageMode, false);
    const showSuggestions = normalizeBoolean(entry.showSuggestions, false);
    const suggestions = normalizeStringArray(entry.suggestions);
    const suggestionPrompts = normalizeOptionalStringArray(
      entry.suggestionPrompts
    );
    const suggestionEditable = normalizeBooleanArray(entry.suggestionEditable);
    const labelByLanguage = normalizeLanguageMap(entry.labelByLanguage);
    const promptByLanguage = normalizeLanguageMap(entry.promptByLanguage);
    const suggestionsByLanguage = normalizeSuggestionsMap(
      entry.suggestionsByLanguage
    );
    const suggestionPromptsByLanguage = normalizeOptionalSuggestionsMap(
      entry.suggestionPromptsByLanguage
    );
    const suggestionEditableByLanguage = normalizeOptionalBooleanMap(
      entry.suggestionEditableByLanguage
    );
    const targetId =
      typeof entry.targetId === "string" && entry.targetId.trim().length > 0
        ? entry.targetId.trim()
        : null;

    const hasLocalizedSuggestions =
      suggestionsByLanguage &&
      Object.values(suggestionsByLanguage).some((list) => list.length > 0);
    const hasSuggestions =
      showSuggestions && (suggestions.length > 0 || hasLocalizedSuggestions);
    const hasPrompt = prompt.length > 0;

    const hasValidActionConfiguration =
      actionType === "prompt" ? hasPrompt || hasSuggestions : Boolean(targetId);

    if (!id || !label || !hasValidActionConfiguration) {
      continue;
    }

    items.push({
      actionType,
      id,
      label,
      prompt,
      iconUrl,
      isActive,
      behavior,
      selectImageMode,
      showSuggestions,
      suggestions,
      suggestionPrompts,
      suggestionEditable,
      labelByLanguage,
      promptByLanguage,
      suggestionsByLanguage,
      suggestionPromptsByLanguage,
      suggestionEditableByLanguage,
      targetId,
    });
  }

  return { enabled, items };
}

function resolveLocalizedValue(
  fallback: string,
  translations: Record<string, string> | undefined,
  activeCode: string,
  defaultCode: string | null
) {
  const direct = translations?.[activeCode];
  if (direct && direct.trim().length > 0) {
    return direct.trim();
  }
  if (defaultCode) {
    const fallbackValue = translations?.[defaultCode];
    if (fallbackValue && fallbackValue.trim().length > 0) {
      return fallbackValue.trim();
    }
  }
  return fallback;
}

function resolveLocalizedList(
  fallback: string[],
  translations: Record<string, string[]> | undefined,
  activeCode: string,
  defaultCode: string | null
) {
  const direct = translations?.[activeCode];
  if (direct && direct.length > 0) {
    return direct;
  }
  if (defaultCode) {
    const defaultList = translations?.[defaultCode];
    if (defaultList && defaultList.length > 0) {
      return defaultList;
    }
  }
  return fallback;
}

function resolveLocalizedBooleanList(
  fallback: boolean[],
  translations: Record<string, boolean[]> | undefined,
  activeCode: string,
  defaultCode: string | null
) {
  const direct = translations?.[activeCode];
  if (direct && direct.length > 0) {
    return direct;
  }
  if (defaultCode) {
    const defaultList = translations?.[defaultCode];
    if (defaultList && defaultList.length > 0) {
      return defaultList;
    }
  }
  return fallback;
}

export function getDefaultIconPromptActions(
  activeCode: string
): IconPromptAction[] {
  if (activeCode === "kha") {
    return [
      {
        actionType: "prompt",
        id: "shna-dur",
        label: "Shna dur",
        prompt: "Shna dur...",
        iconUrl: null,
        behavior: "replace",
        selectImageMode: true,
        showSuggestions: true,
        suggestions: buildPromptSuggestions([
          { label: "Tirot Sing kum u briew Shisha" },
          { label: "Shillong Police Bazar ha ka snem 2050" },
        ]),
        targetId: null,
      },
      {
        actionType: "prompt",
        id: "thoh-jingrwai",
        label: "Thoh jingrwai",
        prompt: "Thoh jingrwai ba...",
        iconUrl: null,
        behavior: "replace",
        selectImageMode: false,
        showSuggestions: true,
        suggestions: buildPromptSuggestions([
          { label: "Jingrwai shaphang ka jingitynnad ka Meghalaya" },
          { label: "Jingrwai shaphang ka jingieid" },
        ]),
        targetId: null,
      },
    ];
  }

  return [
    {
      actionType: "prompt",
      id: "create-image",
      label: "Create image",
      prompt: "Create an image of...",
      iconUrl: null,
      behavior: "replace",
      selectImageMode: true,
      showSuggestions: true,
      suggestions: buildPromptSuggestions([
        { label: "Tirot Sing as a real person" },
        { label: "Shillong Police Bazar in 2050" },
      ]),
      targetId: null,
    },
    {
      actionType: "prompt",
      id: "write-lyrics",
      label: "Write Lyrics",
      prompt: "Write lyrics about...",
      iconUrl: null,
      behavior: "replace",
      selectImageMode: false,
      showSuggestions: true,
      suggestions: buildPromptSuggestions([
        { label: "Lyrics about the beauty of Meghalaya" },
        { label: "Lyrics about love" },
      ]),
      targetId: null,
    },
  ];
}

async function loadIconPromptSettings() {
  const keys = [
    ICON_PROMPTS_SETTING_KEY,
    ICON_PROMPTS_ENABLED_SETTING_KEY,
    CALCULATOR_FEATURE_FLAG_KEY,
    EXPLORE_MEGHALAYA_FEATURE_FLAG_KEY,
    IMAGE_GENERATION_FEATURE_FLAG_KEY,
    JOBS_FEATURE_FLAG_KEY,
    LIVE_TRANSLATION_ANDROID_FEATURE_FLAG_KEY,
    LIVE_TRANSLATION_WEB_FEATURE_FLAG_KEY,
    STUDY_MODE_FEATURE_FLAG_KEY,
    TRANSLATE_FEATURE_FLAG_KEY,
    VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY,
    VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY,
    VOICE_CHAT_WEB_FEATURE_FLAG_KEY,
  ];

  try {
    const settings = await getLiteAppSettingsByKeysUncached(keys);
    const byKey = new Map(settings.map((setting) => [setting.key, setting.value]));

    return {
      confirmed: true,
      enabledSetting: byKey.get(ICON_PROMPTS_ENABLED_SETTING_KEY) ?? null,
      featureSettings: byKey,
      rawSettings: byKey.get(ICON_PROMPTS_SETTING_KEY) ?? null,
    };
  } catch (error) {
    console.warn("Failed to load icon prompt settings.", error);
    const remembered = getLastKnownAppSettingsByKeys(keys);

    return {
      confirmed: false,
      enabledSetting: remembered.get(ICON_PROMPTS_ENABLED_SETTING_KEY) ?? "enabled",
      featureSettings: remembered,
      rawSettings: remembered.get(ICON_PROMPTS_SETTING_KEY) ?? null,
    };
  }
}

async function fetchIconPromptActions(
  preferredLanguage?: string | null,
  userRole?: UserRole | null,
  platform: HomeShortcutPlatform = "web"
) {
  const startedAt = Date.now();
  const [{ activeLanguage, languages }, settings] = await Promise.all([
    resolveLanguage(preferredLanguage),
    loadIconPromptSettings(),
  ]);
  const { confirmed, enabledSetting, featureSettings, rawSettings } = settings;

  const { enabled, items } = normalizeIconPromptSettings(
    rawSettings,
    enabledSetting
  );

  const mode = parseIconPromptsAccessModeSetting(enabledSetting);
  const enabledForRole = isFeatureEnabledForRole(mode, userRole ?? null);
  if (!enabled || !enabledForRole) {
    return [];
  }

  const defaultLanguage =
    languages.find((language) => language.isDefault) ?? languages[0] ?? null;
  const defaultCode = defaultLanguage?.code ?? null;

  const linkedTargets = Array.from(
    new Map(
      items
        .filter((item) => item.actionType !== "prompt")
        .map((item) => {
          const target = getHomeShortcutTarget(item.targetId);
          return target ? [target.id, target] : null;
        })
        .filter(
          (
            entry
          ): entry is [string, NonNullable<ReturnType<typeof getHomeShortcutTarget>>] =>
            Boolean(entry)
        )
    ).values()
  );
  const availableTargetIds = new Set(
    (
      await Promise.all(
        linkedTargets.map(async (target) => ({
          available: await isHomeShortcutTargetAvailable({
            platform,
            role: userRole,
            settings: featureSettings,
            target,
          }).catch((error) => {
            console.error(
              `[icon-prompts] Failed to confirm linked target "${target.id}"; hiding its shortcut.`,
              error
            );
            return false;
          }),
          id: target.id,
        }))
      )
    )
      .filter((entry) => entry.available)
      .map((entry) => entry.id)
  );

  const processedItems = items
    .filter((item) => {
      if (!item.isActive) {
        return false;
      }
      if (item.actionType === "prompt") {
        return true;
      }
      const target = getHomeShortcutTarget(item.targetId);
      return Boolean(
        target &&
          target.kind === item.actionType &&
          availableTargetIds.has(target.id)
      );
    })
    .map<IconPromptAction>((item) => ({
      actionType: item.actionType,
      id: item.id,
      label: resolveLocalizedValue(
        item.label,
        item.labelByLanguage,
        activeLanguage.code,
        defaultCode
      ),
      prompt:
        item.actionType === "prompt"
          ? resolveLocalizedValue(
              item.prompt,
              item.promptByLanguage,
              activeLanguage.code,
              defaultCode
            )
          : "",
      iconUrl: item.iconUrl,
      behavior: item.actionType === "prompt" ? item.behavior : "replace",
      selectImageMode:
        item.actionType === "prompt" && item.selectImageMode,
      showSuggestions:
        item.actionType === "prompt" && item.showSuggestions,
      suggestions: item.actionType === "prompt" && item.showSuggestions
        ? (() => {
            const resolvedSuggestions = resolveLocalizedList(
              item.suggestions,
              item.suggestionsByLanguage,
              activeLanguage.code,
              defaultCode
            );
            const resolvedSuggestionPrompts = resolveLocalizedList(
              item.suggestionPrompts ?? [],
              item.suggestionPromptsByLanguage,
              activeLanguage.code,
              defaultCode
            );
            const resolvedSuggestionEditable = resolveLocalizedBooleanList(
              item.suggestionEditable ?? [],
              item.suggestionEditableByLanguage,
              activeLanguage.code,
              defaultCode
            );

            return resolvedSuggestions
              .map((label, index) => {
                const trimmedLabel = label.trim();
                if (!trimmedLabel) {
                  return null;
                }
                const rawPrompt = resolvedSuggestionPrompts[index] ?? "";
                const trimmedPrompt = rawPrompt.trim();
                return {
                  label: trimmedLabel,
                  prompt: trimmedPrompt || trimmedLabel,
                  isEditable: Boolean(resolvedSuggestionEditable[index]),
                };
              })
              .filter((entry): entry is IconPromptSuggestion => Boolean(entry));
          })()
        : [],
      targetId: item.targetId,
    }))
    .filter(
      (item) =>
        item.actionType !== "prompt" ||
        item.prompt.trim().length > 0 ||
        (item.showSuggestions && item.suggestions.length > 0)
    );

  if (processedItems.length === 0 && !confirmed) {
    console.warn(
      `[icon-prompts] Using render-only defaults after unconfirmed settings read for language "${activeLanguage.code}".`
    );
    return getDefaultIconPromptActions(activeLanguage.code);
  }

  console.info(
    `[icon-prompts] loaded ${processedItems.length} action(s) in ${
      Date.now() - startedAt
    }ms for language "${activeLanguage.code}".`
  );

  return processedItems;
}

export const loadIconPromptActions = cache(fetchIconPromptActions);
