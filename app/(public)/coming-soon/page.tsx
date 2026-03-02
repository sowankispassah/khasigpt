import { ComingSoonCountdown } from "./coming-soon-countdown";
import styles from "./coming-soon.module.css";
import {
  SITE_COMING_SOON_CONTENT_SETTING_KEY,
  SITE_COMING_SOON_TIMER_SETTING_KEY,
} from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import {
  normalizeComingSoonContentSetting,
  normalizeComingSoonTimerSetting,
} from "@/lib/settings/coming-soon";

export const dynamic = "force-dynamic";

export default async function ComingSoonPage() {
  let storedContent: unknown = null;
  let storedTimer: unknown = null;
  try {
    [storedContent, storedTimer] = await Promise.all([
      getAppSetting<unknown>(SITE_COMING_SOON_CONTENT_SETTING_KEY),
      getAppSetting<unknown>(SITE_COMING_SOON_TIMER_SETTING_KEY),
    ]);
  } catch (error) {
    console.error(
      "[coming-soon] Failed to load custom content/settings. Falling back to default copy.",
      error
    );
  }

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
