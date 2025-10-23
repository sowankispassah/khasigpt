import { cache } from "react";

import { getAppSetting } from "@/lib/db/queries";
import { DEFAULT_SUGGESTED_PROMPTS } from "@/lib/constants";

async function fetchSuggestedPrompts(): Promise<string[]> {
  try {
    const stored = await getAppSetting<unknown>("suggestedPrompts");

    if (Array.isArray(stored)) {
      const prompts = stored
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0);

      if (prompts.length > 0) {
        return prompts;
      }
    }
  } catch (error) {
    console.warn("Failed to load suggested prompts, using defaults.", error);
  }

  return [...DEFAULT_SUGGESTED_PROMPTS];
}

export const loadSuggestedPrompts = cache(fetchSuggestedPrompts);

