import { z } from "zod";

export const JOBS_PDF_EXTRACTION_MODES = ["off", "hybrid", "full"] as const;
export const JOBS_PDF_SOURCE_STRATEGIES = [
  "heuristic",
  "llm_text",
  "llm_pdf",
] as const;
export const JOBS_PDF_EXTRACTION_VERSION = 1 as const;

export type JobsPdfExtractionMode = (typeof JOBS_PDF_EXTRACTION_MODES)[number];
export type JobsPdfSourceStrategy =
  (typeof JOBS_PDF_SOURCE_STRATEGIES)[number];

export type JobsPdfExtractedRole = {
  title: string;
  vacancies: string | null;
  salaryText: string | null;
  location: string | null;
  qualifications: string | null;
  evidenceText: string | null;
};

export type JobsPdfExtractedData = {
  version: typeof JOBS_PDF_EXTRACTION_VERSION;
  mode: JobsPdfExtractionMode;
  modelId: string | null;
  sourceStrategy: JobsPdfSourceStrategy;
  extractedAt: string;
  notificationDate: string | null;
  applicationLastDate: string | null;
  salarySummary: string | null;
  roles: JobsPdfExtractedRole[];
};

type JobsPdfExtractedDataInput = {
  version?: number;
  mode?: unknown;
  modelId?: unknown;
  sourceStrategy?: unknown;
  extractedAt?: unknown;
  notificationDate?: unknown;
  applicationLastDate?: unknown;
  salarySummary?: unknown;
  roles?: unknown;
};

const jobsPdfExtractedRoleSchema = z.object({
  title: z.string().trim().min(1).max(220),
  vacancies: z.string().trim().min(1).max(120).nullable(),
  salaryText: z.string().trim().min(1).max(220).nullable(),
  location: z.string().trim().min(1).max(220).nullable(),
  qualifications: z.string().trim().min(1).max(500).nullable(),
  evidenceText: z.string().trim().min(1).max(600).nullable(),
});

export const jobsPdfExtractedDataSchema = z.object({
  version: z.literal(JOBS_PDF_EXTRACTION_VERSION),
  mode: z.enum(JOBS_PDF_EXTRACTION_MODES),
  modelId: z.string().trim().min(1).max(120).nullable(),
  sourceStrategy: z.enum(JOBS_PDF_SOURCE_STRATEGIES),
  extractedAt: z.string().trim().min(1).max(120),
  notificationDate: z.string().trim().min(1).max(120).nullable(),
  applicationLastDate: z.string().trim().min(1).max(120).nullable(),
  salarySummary: z.string().trim().min(1).max(220).nullable(),
  roles: z.array(jobsPdfExtractedRoleSchema).max(50),
});

function normalizeOptionalString(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

export function parseJobsPdfExtractionMode(
  value: unknown
): JobsPdfExtractionMode | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return JOBS_PDF_EXTRACTION_MODES.includes(
    normalized as JobsPdfExtractionMode
  )
    ? (normalized as JobsPdfExtractionMode)
    : null;
}

export function parseJobsPdfExtractedData(
  value: unknown
): JobsPdfExtractedData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as JobsPdfExtractedDataInput;
  const normalizedRoles = Array.isArray(candidate.roles)
    ? candidate.roles
        .map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return null;
          }

          const role = entry as Record<string, unknown>;
          const title = normalizeOptionalString(role.title, 220);
          if (!title) {
            return null;
          }

          return {
            title,
            vacancies: normalizeOptionalString(role.vacancies, 120),
            salaryText: normalizeOptionalString(role.salaryText, 220),
            location: normalizeOptionalString(role.location, 220),
            qualifications: normalizeOptionalString(role.qualifications, 500),
            evidenceText: normalizeOptionalString(role.evidenceText, 600),
          };
        })
        .filter((entry): entry is JobsPdfExtractedRole => Boolean(entry))
    : [];

  const normalized = {
    version:
      typeof candidate.version === "number"
        ? Math.trunc(candidate.version)
        : undefined,
    mode: parseJobsPdfExtractionMode(candidate.mode),
    modelId: normalizeOptionalString(candidate.modelId, 120),
    sourceStrategy: normalizeOptionalString(candidate.sourceStrategy, 40),
    extractedAt: normalizeOptionalString(candidate.extractedAt, 120),
    notificationDate: normalizeOptionalString(candidate.notificationDate, 120),
    applicationLastDate: normalizeOptionalString(
      candidate.applicationLastDate,
      120
    ),
    salarySummary: normalizeOptionalString(candidate.salarySummary, 220),
    roles: normalizedRoles,
  };

  const parsed = jobsPdfExtractedDataSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

export function buildJobsPdfCompensationEntries(
  extractedData: JobsPdfExtractedData | null | undefined
) {
  if (!extractedData) {
    return [];
  }

  return extractedData.roles
    .filter((role) => role.title && role.salaryText)
    .map((role) => ({
      role: role.title,
      salary: role.salaryText as string,
    }));
}

export function buildJobsPdfExtractedSummaryLines(
  extractedData: JobsPdfExtractedData | null | undefined
) {
  if (!extractedData) {
    return [];
  }

  const lines: string[] = [];
  if (extractedData.salarySummary) {
    lines.push(`Salary: ${extractedData.salarySummary}`);
  }
  if (extractedData.notificationDate) {
    lines.push(`Notification Date: ${extractedData.notificationDate}`);
  }
  if (extractedData.applicationLastDate) {
    lines.push(`Application Last Date: ${extractedData.applicationLastDate}`);
  }

  for (const role of extractedData.roles.slice(0, 20)) {
    const parts = [
      role.title,
      role.vacancies ? `Vacancies: ${role.vacancies}` : "",
      role.salaryText ? `Salary: ${role.salaryText}` : "",
      role.location ? `Location: ${role.location}` : "",
      role.qualifications ? `Qualifications: ${role.qualifications}` : "",
      role.evidenceText ? `Evidence: ${role.evidenceText}` : "",
    ].filter(Boolean);

    if (parts.length > 0) {
      lines.push(`Role: ${parts.join(" | ")}`);
    }
  }

  return lines;
}
