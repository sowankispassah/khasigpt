import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { z } from "zod";
import {
  JOBS_PDF_EXTRACTION_VERSION,
  type JobsPdfExtractedData,
  type JobsPdfExtractedRole,
  type JobsPdfSourceStrategy,
} from "@/lib/jobs/pdf-extraction";
import type { JobsPdfExtractionSettings } from "@/lib/jobs/pdf-extraction-settings";
import {
  countPdfStructuredFields,
  extractPdfStructuredFields,
  normalizeMultiline,
  normalizeWhitespace,
  type PdfStructuredFields,
  truncateText,
} from "@/lib/scraper/scraper-utils";
import { extractDocumentTextFromBuffer } from "@/lib/uploads/document-parser";

const DEFAULT_LLM_MAX_BYTES = 6 * 1024 * 1024;
const DEFAULT_LLM_MAX_OUTPUT_TOKENS = 4_000;
const HYBRID_TEXT_TRIGGER_MIN_CHARS = 800;
const HYBRID_KEYWORD_PATTERN =
  /\b(post|posts|designation|vacancy|vacancies|pay level|name of post)\b/i;
const MAX_LLM_TEXT_INPUT_CHARS = 80_000;

const googleJobsPdfClient =
  process.env.GOOGLE_API_KEY !== undefined
    ? createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY })
    : null;

const llmRoleSchema = z.object({
  title: z.string().trim().min(1).max(220),
  vacancies: z.string().trim().min(1).max(120).nullable(),
  salaryText: z.string().trim().min(1).max(220).nullable(),
  location: z.string().trim().min(1).max(220).nullable(),
  qualifications: z.string().trim().min(1).max(500).nullable(),
  evidenceText: z.string().trim().min(1).max(600).nullable(),
});

const llmPayloadSchema = z.object({
  notificationDate: z.string().trim().min(1).max(120).nullable(),
  applicationLastDate: z.string().trim().min(1).max(120).nullable(),
  salarySummary: z.string().trim().min(1).max(220).nullable(),
  roles: z.array(llmRoleSchema).max(50),
});

type JobPdfExtractionOutcome = {
  pdfText: string;
  fields: PdfStructuredFields;
  extractedFieldsCount: number;
  extractedData: JobsPdfExtractedData;
};

type LlmExtractionPayload = z.infer<typeof llmPayloadSchema>;

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

function normalizeLlmPayload(value: unknown): LlmExtractionPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
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
        .filter((role): role is JobsPdfExtractedRole => Boolean(role))
    : [];

  const parsed = llmPayloadSchema.safeParse({
    notificationDate: normalizeOptionalString(candidate.notificationDate, 120),
    applicationLastDate: normalizeOptionalString(
      candidate.applicationLastDate,
      120
    ),
    salarySummary: normalizeOptionalString(candidate.salarySummary, 220),
    roles: normalizedRoles,
  });

  return parsed.success ? parsed.data : null;
}

function extractJsonObjectText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() || trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    return null;
  }

  return candidate.slice(firstBrace, lastBrace + 1);
}

function hasMeaningfulLlmPayload(payload: LlmExtractionPayload | null) {
  if (!payload) {
    return false;
  }

  return Boolean(
    payload.notificationDate ||
      payload.applicationLastDate ||
      payload.salarySummary ||
      payload.roles.length > 0
  );
}

async function extractRawPdfText({
  buffer,
  maxPdfTextChars,
}: {
  buffer: Buffer;
  maxPdfTextChars: number;
}) {
  try {
    const parsed = await extractDocumentTextFromBuffer(
      {
        name: "job-notification.pdf",
        buffer,
        mediaType: "application/pdf",
      },
      {
        maxTextChars: maxPdfTextChars,
        pdfOcrMode: "disabled",
      }
    );
    return normalizeMultiline(parsed.text);
  } catch {
    return "";
  }
}

async function extractOcrPdfText({
  buffer,
  maxPdfTextChars,
  modelId,
}: {
  buffer: Buffer;
  maxPdfTextChars: number;
  modelId: string;
}) {
  try {
    const parsed = await extractDocumentTextFromBuffer(
      {
        name: "job-notification.pdf",
        buffer,
        mediaType: "application/pdf",
      },
      {
        maxTextChars: maxPdfTextChars,
        pdfOcrMode: "fallback",
        pdfOcrModelId: modelId,
      }
    );
    return normalizeMultiline(parsed.text);
  } catch {
    return "";
  }
}

function shouldUseHybridLlm({
  pdfText,
  heuristicFields,
}: {
  pdfText: string;
  heuristicFields: PdfStructuredFields;
}) {
  const normalizedText = normalizeWhitespace(pdfText).toLowerCase();

  return (
    normalizedText.length < HYBRID_TEXT_TRIGGER_MIN_CHARS ||
    !heuristicFields.salary ||
    (!heuristicFields.notificationDate && !heuristicFields.applicationLastDate) ||
    HYBRID_KEYWORD_PATTERN.test(normalizedText)
  );
}

function getLlmMaxBytes() {
  const raw = Number.parseInt(process.env.DOCUMENT_PDF_OCR_MAX_BYTES ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LLM_MAX_BYTES;
}

function getLlmMaxOutputTokens() {
  const raw = Number.parseInt(
    process.env.DOCUMENT_PDF_OCR_MAX_OUTPUT_TOKENS ?? "",
    10
  );
  return Number.isFinite(raw) && raw > 0
    ? Math.max(500, Math.min(raw, 8_000))
    : DEFAULT_LLM_MAX_OUTPUT_TOKENS;
}

async function runTextStructuredExtraction({
  pdfText,
  modelId,
}: {
  pdfText: string;
  modelId: string;
}) {
  if (!googleJobsPdfClient) {
    return null;
  }

  const inputText = truncateText(pdfText, MAX_LLM_TEXT_INPUT_CHARS);
  const result = await generateText({
    model: googleJobsPdfClient.languageModel(modelId),
    maxOutputTokens: getLlmMaxOutputTokens(),
    system: [
      "You extract structured job-notification data from PDF text.",
      "Return JSON only.",
      "Use exact values visible in the text. Do not infer or normalize beyond copying the visible value.",
      "If a field is missing or uncertain, return null.",
      "Return this schema exactly:",
      '{"notificationDate": string|null, "applicationLastDate": string|null, "salarySummary": string|null, "roles": [{"title": string, "vacancies": string|null, "salaryText": string|null, "location": string|null, "qualifications": string|null, "evidenceText": string|null}]}',
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "Extract job notification details from this PDF text.",
              "Include role rows only when the document explicitly lists posts/designations/roles.",
              "evidenceText should be a short verbatim snippet from the text supporting the role row.",
              "",
              inputText,
            ].join("\n"),
          },
        ],
      },
    ],
  });

  const jsonText = extractJsonObjectText(result.text ?? "");
  if (!jsonText) {
    return null;
  }

  return normalizeLlmPayload(JSON.parse(jsonText));
}

async function runPdfStructuredExtraction({
  buffer,
  modelId,
}: {
  buffer: Buffer;
  modelId: string;
}) {
  if (!googleJobsPdfClient) {
    return null;
  }

  if (buffer.byteLength > getLlmMaxBytes()) {
    return null;
  }

  const result = await generateText({
    model: googleJobsPdfClient.languageModel(modelId),
    maxOutputTokens: getLlmMaxOutputTokens(),
    system: [
      "You extract structured job-notification data directly from PDFs.",
      "Return JSON only.",
      "Use exact values visible in the PDF. Do not infer missing values.",
      "If a field is missing or uncertain, return null.",
      "Return this schema exactly:",
      '{"notificationDate": string|null, "applicationLastDate": string|null, "salarySummary": string|null, "roles": [{"title": string, "vacancies": string|null, "salaryText": string|null, "location": string|null, "qualifications": string|null, "evidenceText": string|null}]}',
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              "Extract job notification details from this PDF.",
              "If the PDF contains multiple posts/roles, list them in roles.",
              "evidenceText should be a short verbatim snippet from the PDF supporting the role row.",
            ].join("\n"),
          },
          {
            type: "file",
            data: buffer,
            mediaType: "application/pdf",
          },
        ],
      },
    ],
  });

  const jsonText = extractJsonObjectText(result.text ?? "");
  if (!jsonText) {
    return null;
  }

  return normalizeLlmPayload(JSON.parse(jsonText));
}

function mergeExtractedData({
  mode,
  modelId,
  strategy,
  extractedAt,
  heuristicFields,
  llmPayload,
}: {
  mode: JobsPdfExtractionSettings["mode"];
  modelId: string | null;
  strategy: JobsPdfSourceStrategy;
  extractedAt: string;
  heuristicFields: PdfStructuredFields;
  llmPayload: LlmExtractionPayload | null;
}): JobsPdfExtractedData {
  return {
    version: JOBS_PDF_EXTRACTION_VERSION,
    mode,
    modelId: strategy === "heuristic" ? null : modelId,
    sourceStrategy: strategy,
    extractedAt,
    notificationDate:
      llmPayload?.notificationDate ?? heuristicFields.notificationDate ?? null,
    applicationLastDate:
      llmPayload?.applicationLastDate ??
      heuristicFields.applicationLastDate ??
      null,
    salarySummary: llmPayload?.salarySummary ?? heuristicFields.salary ?? null,
    roles: llmPayload?.roles ?? [],
  };
}

function mergeStructuredFields({
  heuristicFields,
  extractedData,
}: {
  heuristicFields: PdfStructuredFields;
  extractedData: JobsPdfExtractedData;
}): PdfStructuredFields {
  return {
    salary: extractedData.salarySummary ?? heuristicFields.salary ?? null,
    eligibility: heuristicFields.eligibility ?? null,
    instructions: heuristicFields.instructions ?? null,
    applicationLastDate:
      extractedData.applicationLastDate ??
      heuristicFields.applicationLastDate ??
      null,
    notificationDate:
      extractedData.notificationDate ?? heuristicFields.notificationDate ?? null,
  };
}

async function tryStructuredExtraction({
  strategy,
  buffer,
  pdfText,
  modelId,
}: {
  strategy: Exclude<JobsPdfSourceStrategy, "heuristic">;
  buffer: Buffer;
  pdfText: string;
  modelId: string;
}) {
  try {
    const payload =
      strategy === "llm_text"
        ? await runTextStructuredExtraction({ pdfText, modelId })
        : await runPdfStructuredExtraction({ buffer, modelId });
    return hasMeaningfulLlmPayload(payload) ? payload : null;
  } catch (error) {
    console.warn("[jobs-pdf-extraction] llm_extract_failed", {
      strategy,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function extractJobPdfData({
  buffer,
  maxPdfTextChars,
  settings,
}: {
  buffer: Buffer;
  maxPdfTextChars: number;
  settings: JobsPdfExtractionSettings;
}): Promise<JobPdfExtractionOutcome | null> {
  const basePdfText = await extractRawPdfText({ buffer, maxPdfTextChars });
  if (!basePdfText && settings.mode === "off") {
    return null;
  }

  const heuristicFields = extractPdfStructuredFields(basePdfText);
  const shouldHybridLlm =
    settings.mode !== "off" &&
    shouldUseHybridLlm({
      pdfText: basePdfText,
      heuristicFields,
    });

  let llmPayload: LlmExtractionPayload | null = null;
  let strategy: JobsPdfSourceStrategy = "heuristic";

  if (settings.mode === "full") {
    llmPayload = await tryStructuredExtraction({
      strategy: "llm_pdf",
      buffer,
      pdfText: basePdfText,
      modelId: settings.effectiveModelId,
    });
    if (llmPayload) {
      strategy = "llm_pdf";
    }
  }

  if (!llmPayload && shouldHybridLlm) {
    const hybridStrategy =
      normalizeWhitespace(basePdfText).length >= HYBRID_TEXT_TRIGGER_MIN_CHARS
        ? "llm_text"
        : "llm_pdf";
    llmPayload = await tryStructuredExtraction({
      strategy: hybridStrategy,
      buffer,
      pdfText: basePdfText,
      modelId: settings.effectiveModelId,
    });
    if (llmPayload) {
      strategy = hybridStrategy;
    }
  }

  let pdfText = basePdfText;
  if (
    settings.mode !== "off" &&
    (!pdfText || (strategy === "llm_pdf" && pdfText.length < HYBRID_TEXT_TRIGGER_MIN_CHARS))
  ) {
    const ocrText = await extractOcrPdfText({
      buffer,
      maxPdfTextChars,
      modelId: settings.effectiveModelId,
    });
    if (ocrText) {
      pdfText = ocrText;
    }
  }

  if (!pdfText) {
    return null;
  }

  const resolvedHeuristicFields =
    pdfText === basePdfText ? heuristicFields : extractPdfStructuredFields(pdfText);
  const extractedAt = new Date().toISOString();
  const extractedData = mergeExtractedData({
    mode: settings.mode,
    modelId: settings.effectiveModelId,
    strategy,
    extractedAt,
    heuristicFields: resolvedHeuristicFields,
    llmPayload,
  });
  const fields = mergeStructuredFields({
    heuristicFields:
      strategy === "heuristic"
        ? resolvedHeuristicFields
        : extractPdfStructuredFields(pdfText),
    extractedData,
  });

  return {
    pdfText,
    fields,
    extractedFieldsCount: countPdfStructuredFields(fields),
    extractedData,
  };
}
