import "server-only";

import {
  getAppSettingsByKeys,
  getLastKnownAppSetting,
} from "@/lib/db/queries";
import {
  LIVE_TRANSLATION_DEFAULT_LANGUAGE_A_SETTING_KEY,
  LIVE_TRANSLATION_DEFAULT_LANGUAGE_B_SETTING_KEY,
  LIVE_TRANSLATION_SUPPORTED_LANGUAGES_SETTING_KEY,
  LIVE_TRANSLATION_SYSTEM_INSTRUCTION_SETTING_KEY,
} from "@/lib/live-translation/config";
import { withTimeout } from "@/lib/utils/async";

const BASE_LIVE_TRANSLATION_SETTING_KEYS = [
  LIVE_TRANSLATION_SUPPORTED_LANGUAGES_SETTING_KEY,
  LIVE_TRANSLATION_DEFAULT_LANGUAGE_A_SETTING_KEY,
  LIVE_TRANSLATION_DEFAULT_LANGUAGE_B_SETTING_KEY,
] as const;

type LoadLiveTranslationSettingsOptions = {
  includeInstruction?: boolean;
  source: string;
  timeoutMs: number;
};

function getRequestedKeys(includeInstruction: boolean) {
  return includeInstruction
    ? [
        ...BASE_LIVE_TRANSLATION_SETTING_KEYS,
        LIVE_TRANSLATION_SYSTEM_INSTRUCTION_SETTING_KEY,
      ]
    : [...BASE_LIVE_TRANSLATION_SETTING_KEYS];
}

export async function loadLiveTranslationSettingsValues({
  includeInstruction = false,
  source,
  timeoutMs,
}: LoadLiveTranslationSettingsOptions) {
  const keys = getRequestedKeys(includeInstruction);
  const degradedKeys = new Set<string>();
  let values = new Map<string, unknown>();

  try {
    const rows = await withTimeout(getAppSettingsByKeys(keys), timeoutMs, () => {
      console.error(`[${source}] Live translation settings read timed out.`, {
        keys,
        timeoutMs,
      });
    });
    values = new Map(rows.map((row) => [row.key, row.value]));
  } catch (error) {
    console.error(`[${source}] Live translation settings read failed.`, error);
    for (const key of keys) {
      degradedKeys.add(key);
    }
  }

  const readValue = <T>(key: string): T | null => {
    if (values.has(key)) {
      return values.get(key) as T;
    }
    degradedKeys.add(key);
    return getLastKnownAppSetting<T>(key);
  };

  return {
    defaultLanguageA: readValue<string>(
      LIVE_TRANSLATION_DEFAULT_LANGUAGE_A_SETTING_KEY
    ),
    defaultLanguageB: readValue<string>(
      LIVE_TRANSLATION_DEFAULT_LANGUAGE_B_SETTING_KEY
    ),
    degradedKeys: Array.from(degradedKeys),
    instruction: includeInstruction
      ? readValue<string>(LIVE_TRANSLATION_SYSTEM_INSTRUCTION_SETTING_KEY)
      : null,
    languagesValue: readValue<unknown>(
      LIVE_TRANSLATION_SUPPORTED_LANGUAGES_SETTING_KEY
    ),
  };
}
