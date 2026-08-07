"use client";

import { useEffect, useMemo, useState } from "react";
import type { ComingSoonTimerSetting } from "@/lib/settings/coming-soon";
import styles from "./coming-soon.module.css";

type CountdownValues = {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
};

function toCountdown(totalSecondsInput: number): CountdownValues {
  const totalSeconds = Math.max(totalSecondsInput, 0);

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days: String(days),
    hours: String(hours).padStart(2, "0"),
    minutes: String(minutes).padStart(2, "0"),
    seconds: String(seconds).padStart(2, "0"),
  };
}

function CountdownItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className={styles.countdownItem}>
      <span className={styles.countdownValue}>{value}</span>
      <span className={styles.countdownLabel}>{label}</span>
    </div>
  );
}

export function ComingSoonCountdown({
  settings,
}: {
  settings: ComingSoonTimerSetting;
}) {
  const [nowMs, setNowMs] = useState<number>(Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const values = useMemo(() => {
    const referenceMs = new Date(settings.referenceIso).getTime();
    const safeReferenceMs = Number.isFinite(referenceMs) ? referenceMs : nowMs;
    const totalSeconds =
      settings.mode === "countup"
        ? Math.floor((nowMs - safeReferenceMs) / 1000)
        : Math.floor((safeReferenceMs - nowMs) / 1000);

    return toCountdown(totalSeconds);
  }, [nowMs, settings.mode, settings.referenceIso]);

  const items = useMemo(
    () => [
      { label: "Days", value: values.days },
      { label: "Hours", value: values.hours },
      { label: "Minutes", value: values.minutes },
      { label: "Second", value: values.seconds },
    ],
    [values]
  );

  return (
    <>
      <p className={styles.timerLabel}>{settings.label}</p>
      <div className={styles.countdownWrap}>
        {items.map((item, index) => (
          <div className={styles.countdownCluster} key={item.label}>
            <CountdownItem label={item.label} value={item.value} />
            {index < items.length - 1 ? (
              <span className={styles.countdownColon} aria-hidden>
                :
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
