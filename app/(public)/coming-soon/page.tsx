import {
  SITE_COMING_SOON_CONTENT_SETTING_KEY,
  SITE_COMING_SOON_TIMER_SETTING_KEY,
} from "@/lib/constants";
import {
  getAppSettingsByKeys,
  getLastKnownAppSettingsByKeys,
} from "@/lib/db/queries";
import {
  normalizeComingSoonContentSetting,
  normalizeComingSoonTimerSetting,
} from "@/lib/settings/coming-soon";
import { withTimeout } from "@/lib/utils/async";
import styles from "./coming-soon.module.css";
import { ComingSoonCountdown } from "./coming-soon-countdown";

export const dynamic = "force-dynamic";

const COMING_SOON_SETTINGS_TIMEOUT_MS = 2_000;
const COMING_SOON_SETTING_KEYS = [
  SITE_COMING_SOON_CONTENT_SETTING_KEY,
  SITE_COMING_SOON_TIMER_SETTING_KEY,
] as const;

export default async function ComingSoonPage() {
  const settings = await withTimeout(
    getAppSettingsByKeys([...COMING_SOON_SETTING_KEYS]),
    COMING_SOON_SETTINGS_TIMEOUT_MS,
    () => {
      console.error("[coming-soon] Settings query timed out.", {
        timeoutMs: COMING_SOON_SETTINGS_TIMEOUT_MS,
      });
    }
  )
    .then((rows) => new Map(rows.map((row) => [row.key, row.value])))
    .catch((error) => {
      console.error(
        "[coming-soon] Failed to load custom content/settings. Using last known values.",
        error
      );
      return getLastKnownAppSettingsByKeys([...COMING_SOON_SETTING_KEYS]);
    });

  const storedContent = settings.get(SITE_COMING_SOON_CONTENT_SETTING_KEY);
  const storedTimer = settings.get(SITE_COMING_SOON_TIMER_SETTING_KEY);
  const content = normalizeComingSoonContentSetting(storedContent);
  const timer = normalizeComingSoonTimerSetting(storedTimer);

  return (
    <main className={styles.page}>
      <div aria-hidden className={styles.background}>
        <div className={styles.rainLayer} />
      </div>

      <div className={styles.content}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>{content.eyebrow}</p>
          <h1 className={styles.title}>{content.title}</h1>
          <ComingSoonCountdown settings={timer} />
        </section>
      </div>
    </main>
  );
}
