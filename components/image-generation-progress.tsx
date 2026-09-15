"use client";

import { EditableTranslation } from "@/components/translation-edit-provider";
import styles from "./image-generation-progress.module.css";

/** The API currently returns only a terminal image; progress is visual until then. */
export function ImageGenerationProgress({
  progress,
}: {
  progress?: number | null;
}) {
  const boundedProgress =
    typeof progress === "number" && Number.isFinite(progress)
      ? Math.max(0, Math.min(0.94, progress > 1 ? progress / 100 : progress))
      : null;

  return (
    <output className={styles.container}>
      <div className={styles.frame}>
        <div aria-hidden="true" className={styles.wash} />
        <div
          aria-hidden="true"
          className={styles.progressWash}
          style={
            boundedProgress === null
              ? undefined
              : { animation: "none", transform: `scaleY(${boundedProgress})` }
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
