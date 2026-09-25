import { config } from "dotenv";
import {
  LIVE_TRANSLATION_ANDROID_FEATURE_FLAG_KEY,
  LIVE_TRANSLATION_WEB_FEATURE_FLAG_KEY,
  VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY,
  VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY,
  VOICE_CHAT_WEB_FEATURE_FLAG_KEY,
} from "../lib/constants";

// Run with: pnpm exec tsx --conditions=react-server scripts/restrict-live-voice-for-launch.ts --apply
// Uses the application feature-write guard, with no broad cache invalidation.
config({ path: ".env.local" });
config({ path: ".env" });
async function main() {
  const { getAppSettingUncached, setAppSetting } = await import("../lib/db/queries");
  const entries = [
    [VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY, "feature.voice_chat.android.toggle"],
    [VOICE_CHAT_WEB_FEATURE_FLAG_KEY, "feature.voice_chat.web.toggle"],
    [VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY, "feature.voice_chat.web.toggle"],
    [LIVE_TRANSLATION_ANDROID_FEATURE_FLAG_KEY, "feature.live_translation.android.toggle"],
    [LIVE_TRANSLATION_WEB_FEATURE_FLAG_KEY, "feature.live_translation.web.toggle"],
  ];
  for (const [key, source] of entries) {
    const previous = await getAppSettingUncached(key);
    console.info({ key, previous, next: "admin_only" });
    if (process.argv.includes("--apply")) {
      await setAppSetting({ key, value: "admin_only" }, {
        featureSettingWrite: { source, route: "scripts/restrict-live-voice-for-launch" },
        revalidateCache: false, revalidateGlobalCache: false,
      });
    }
  }
}
main().then(() => process.exit(0)).catch((error) => { console.error(error instanceof Error ? error.message : "Launch restriction failed"); process.exitCode = 1; });
