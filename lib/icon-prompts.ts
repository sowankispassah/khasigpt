import { cache } from "react";
import {
  ICON_PROMPTS_ENABLED_SETTING_KEY,
  ICON_PROMPTS_SETTING_KEY,
} from "@/lib/constants";
import type { UserRole } from "@/lib/db/schema";
import { getAppSetting } from "@/lib/db/queries";
import {
  isFeatureEnabledForRole,
  parseFeatureAccessMode,
  type FeatureAccessMode,
} from "@/lib/feature-access";
import { getTranslationBundle } from "@/lib/i18n/dictionary";

export type IconPromptBehavior = "append" | "replace";

export type IconPromptSuggestion = {
  label: string;
  prompt: string;
  isEditable: boolean;
};

export type IconPromptItem = {
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
};

export type IconPromptAction = {
  id: string;
  label: string;
  prompt: string;
  iconUrl: string | null;
  behavior: IconPromptBehavior;
  selectImageMode: boolean;
  showSuggestions: boolean;
  suggestions: IconPromptSuggestion[];
};

type StoredIconPromptItem = {
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

export function normalizeIconPromptSettings(
  rawSettings: unknown,
  enabledSetting: unknown
) {
  const enabled = normalizeBoolean(enabledSetting, false);
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

    const hasLocalizedSuggestions =
      suggestionsByLanguage &&
      Object.values(suggestionsByLanguage).some((list) => list.length > 0);
    const hasSuggestions =
      showSuggestions && (suggestions.length > 0 || hasLocalizedSuggestions);
    const hasPrompt = prompt.length > 0;

    if (!id || !label || (!hasPrompt && !hasSuggestions)) {
      continue;
    }

    items.push({
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

async function fetchIconPromptActions(
  preferredLanguage?: string | null,
  userRole?: UserRole | null
) {
  const { activeLanguage, languages } =
    await getTranslationBundle(preferredLanguage);
  let rawSettings: unknown = null;
  let enabledSetting: unknown = null;

  try {
    [rawSettings, enabledSetting] = await Promise.all([
      getAppSetting(ICON_PROMPTS_SETTING_KEY),
      getAppSetting(ICON_PROMPTS_ENABLED_SETTING_KEY),
    ]);
  } catch (error) {
    console.warn("Failed to load icon prompt settings.", error);
  }

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

  return items
    .filter((item) => item.isActive)
    .map<IconPromptAction>((item) => ({
      id: item.id,
      label: resolveLocalizedValue(
        item.label,
        item.labelByLanguage,
        activeLanguage.code,
        defaultCode
      ),
      prompt: resolveLocalizedValue(
        item.prompt,
        item.promptByLanguage,
        activeLanguage.code,
        defaultCode
      ),
      iconUrl: item.iconUrl,
      behavior: item.behavior,
      selectImageMode: item.selectImageMode,
      showSuggestions: item.showSuggestions,
      suggestions: item.showSuggestions
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
    }))
    .filter(
      (item) =>
        item.prompt.trim().length > 0 ||
        (item.showSuggestions && item.suggestions.length > 0)
    );
}

export const loadIconPromptActions = cache(fetchIconPromptActions);
