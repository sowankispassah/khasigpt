import "server-only";

import { DEFAULT_FREE_MESSAGES_PER_DAY, FREE_MESSAGE_SETTINGS_KEY } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";

export type FreeMessageMode = "per-model" | "global";

export type FreeMessageSettings = {
  mode: FreeMessageMode;
  globalLimit: number;
};

export const DEFAULT_FREE_MESSAGE_SETTINGS: FreeMessageSettings = {
  mode: "per-model",
  globalLimit: DEFAULT_FREE_MESSAGES_PER_DAY,
};

export function normalizeFreeMessageSettings(
  value: FreeMessageSettings | null
): FreeMessageSettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_FREE_MESSAGE_SETTINGS };
  }

  const mode: FreeMessageMode =
    value.mode === "global" || value.mode === "per-model"
      ? value.mode
      : DEFAULT_FREE_MESSAGE_SETTINGS.mode;

  const globalLimitSource =
    typeof value.globalLimit === "number" ? value.globalLimit : DEFAULT_FREE_MESSAGES_PER_DAY;
  const globalLimit = Math.max(0, Math.round(globalLimitSource));

  return {
    mode,
    globalLimit,
  };
}

export async function loadFreeMessageSettings(): Promise<FreeMessageSettings> {
  const stored = await getAppSetting<FreeMessageSettings>(FREE_MESSAGE_SETTINGS_KEY);
  return normalizeFreeMessageSettings(stored);
}
