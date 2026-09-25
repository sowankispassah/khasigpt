import "server-only";

import {
  JOBS_SCRAPE_PDF_EXTRACTION_MODE_SETTING_KEY,
  JOBS_SCRAPE_PDF_EXTRACTION_MODEL_ID_SETTING_KEY,
} from "@/lib/constants";
import { getAppSettingUncached } from "@/lib/db/queries";
import {
  type JobsPdfExtractionMode,
  parseJobsPdfExtractionMode,
} from "@/lib/jobs/pdf-extraction";

export const DEFAULT_JOBS_PDF_EXTRACTION_MODE: JobsPdfExtractionMode =
  "hybrid";
export const DEFAULT_JOBS_PDF_MODEL_ID = "gemini-2.5-flash";

export type JobsPdfExtractionSettings = {
  mode: JobsPdfExtractionMode;
  modelId: string | null;
  effectiveModelId: string;
};

export function normalizeJobsPdfExtractionModelId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function resolveJobsPdfExtractionSettings({
  mode,
  modelId,
}: {
  mode: unknown;
  modelId: unknown;
}): JobsPdfExtractionSettings {
  const resolvedMode =
    parseJobsPdfExtractionMode(mode) ?? DEFAULT_JOBS_PDF_EXTRACTION_MODE;
  const resolvedModelId = normalizeJobsPdfExtractionModelId(modelId);
  const effectiveModelId =
    resolvedModelId ??
    normalizeJobsPdfExtractionModelId(process.env.DOCUMENT_PDF_OCR_MODEL) ??
    DEFAULT_JOBS_PDF_MODEL_ID;

  return {
    mode: resolvedMode,
    modelId: resolvedModelId,
    effectiveModelId,
  };
}

export async function getJobsPdfExtractionSettingsUncached() {
  const [mode, modelId] = await Promise.all([
    getAppSettingUncached<unknown>(JOBS_SCRAPE_PDF_EXTRACTION_MODE_SETTING_KEY),
    getAppSettingUncached<unknown>(
      JOBS_SCRAPE_PDF_EXTRACTION_MODEL_ID_SETTING_KEY
    ),
  ]);

  return resolveJobsPdfExtractionSettings({ mode, modelId });
}
