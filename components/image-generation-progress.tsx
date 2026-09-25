"use client";

import { EditableTranslation } from "@/components/translation-edit-provider";
import styles from "./image-generation-progress.module.css";

// Recent production image charges complete in roughly 38–48 seconds. Keep the
// simulated indicator below completion for that window, then hold at 94% until
// the API returns the actual image.
export const IMAGE_GENERATION_EXPECTED_DURATION_MS = 45_000;
export const IMAGE_GENERATION_PROGRESS_CAP = 0.94;

/** The API currently returns only a terminal image; progress is visual until then. */
export function ImageGenerationProgress({
  progress,
  expectedDurationMs = IMAGE_GENERATION_EXPECTED_DURATION_MS,
  startedAt,
}: {
  progress?: number | null;
  expectedDurationMs?: number;
  startedAt?: string | number | Date | null;
}) {
  const boundedProgress =
    typeof progress === "number" && Number.isFinite(progress)
      ? Math.max(
          0,
          Math.min(
            IMAGE_GENERATION_PROGRESS_CAP,
            progress > 1 ? progress / 100 : progress
          )
        )
      : null;
  const safeDurationMs = Math.max(1_000, Math.round(expectedDurationMs));
  const startedAtMs =
    startedAt instanceof Date
      ? startedAt.getTime()
      : typeof startedAt === "number"
        ? startedAt
        : typeof startedAt === "string"
          ? Date.parse(startedAt)
          : Number.NaN;
  const elapsedMs = Number.isFinite(startedAtMs)
    ? Math.max(0, Math.min(safeDurationMs, Date.now() - startedAtMs))
    : 0;

  return (
    <output className={styles.container}>
      <div className={styles.frame}>
        <div aria-hidden="true" className={styles.wash} />
        <div
          aria-hidden="true"
          className={styles.progressWash}
          style={
            boundedProgress === null
              ? {
                  animationDuration: `${safeDurationMs}ms`,
                  ...(elapsedMs > 0
                    ? { animationDelay: `-${elapsedMs}ms` }
                    : {}),
                }
              : {
                  animation: "none",
                  transform: `scaleY(${boundedProgress})`,
                }
          }
        />
        <span className={styles.label}>
          <EditableTranslation
            defaultText="Generating..."
            description="Loading label while an image is being generated."
            translationKey="image.generate.loading"
          />
        </span>
      </div>
    </output>
  );
}
