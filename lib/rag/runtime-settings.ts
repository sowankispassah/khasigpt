import "server-only";

import { unstable_cache } from "next/cache";
import { CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY } from "@/lib/constants";
import {
  appSettingCacheTagForKey,
  getLiteAppSettingUncached,
} from "@/lib/db/app-settings-lite";
import { parseBooleanSetting } from "@/lib/settings/boolean-setting";

const CUSTOM_KNOWLEDGE_CACHE_SECONDS = 60;

const loadCustomKnowledgeSettingCached = unstable_cache(
  () =>
    getLiteAppSettingUncached<string | boolean>(
      CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
    ),
  ["rag-custom-knowledge-enabled"],
  {
    revalidate: CUSTOM_KNOWLEDGE_CACHE_SECONDS,
    tags: [appSettingCacheTagForKey(CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY)],
  },
);

export async function loadCustomKnowledgeEnabledCached(): Promise<boolean> {
  return parseBooleanSetting(await loadCustomKnowledgeSettingCached(), false);
}
