import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { getActiveImageModel } from "@/lib/ai/image-model-registry";
import { resolveLanguageModel } from "@/lib/ai/providers";
import {
  IMAGE_GENERATION_FEATURE_FLAG_KEY,
  IMAGE_PROMPT_TRANSLATION_MODEL_SETTING_KEY,
  TOKENS_PER_CREDIT,
} from "@/lib/constants";
import {
  getActiveSubscriptionForUser,
  getAppSetting,
  getModelConfigById,
  getPricingPlanById,
  getUserById,
} from "@/lib/db/queries";
import type { UserRole } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";

const DEFAULT_NANO_BANANA_MODEL_ID = "gemini-2.5-flash-image";
const NANO_BANANA_MODEL_ID =
  process.env.GOOGLE_NANO_BANANA_MODEL_ID ?? DEFAULT_NANO_BANANA_MODEL_ID;
const DEFAULT_IMAGE_TRANSLATION_MODEL_ID = "gemini-2.5-flash";
const IMAGE_TRANSLATION_MODEL_ID =
  process.env.GOOGLE_IMAGE_TRANSLATION_MODEL_ID ??
  DEFAULT_IMAGE_TRANSLATION_MODEL_ID;
const IMAGE_TRANSLATION_LANGUAGE_CODE =
  process.env.IMAGE_PROMPT_TRANSLATION_LANGUAGE_CODE ?? "kha";
const IMAGE_TRANSLATION_MODE =
  process.env.IMAGE_PROMPT_TRANSLATION_MODE ?? "language";

export const ALLOWED_IMAGE_MEDIA_TYPES = new Set([
  "image/png",
  "image/jpeg",
]);
export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;

type ImageInput = {
  data: string;
  mediaType: string;
};

export type ImageGenerationAccess = {
  enabled: boolean;
  canGenerate: boolean;
  hasCredits: boolean;
  hasPaidPlan: boolean;
  hasPaidCredits: boolean;
  hasManualCredits: boolean;
  requiresPaidCredits: boolean;
  isAdmin: boolean;
  tokensPerImage: number;
  model: {
    id: string;
    provider: string;
    providerModelId: string;
    displayName: string;
    tokensPerImage: number;
  } | null;
};

const googleClient =
  process.env.GOOGLE_API_KEY !== undefined
    ? createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY })
    : null;

function coerceBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }
    return ["true", "1", "yes", "enabled"].includes(normalized);
  }
  return fallback;
}

export function parseImageGenerationEnabledSetting(value: unknown): boolean {
  return coerceBoolean(value, false);
}

export async function getImageGenerationAccess({
  userId,
  userRole,
}: {
  userId: string | null;
  userRole?: UserRole | null;
}): Promise<ImageGenerationAccess> {
  const rawSetting = await getAppSetting<string | boolean | number>(
    IMAGE_GENERATION_FEATURE_FLAG_KEY
  );
  const featureEnabled = parseImageGenerationEnabledSetting(rawSetting);
  const activeModel = await getActiveImageModel();
  const modelEnabled = Boolean(activeModel?.isEnabled);
  const enabled = featureEnabled && modelEnabled;
  const tokensPerImage = Math.max(
    1,
    Math.round(activeModel?.tokensPerImage ?? TOKENS_PER_CREDIT)
  );
  const modelSummary = activeModel
    ? {
        id: activeModel.id,
        provider: activeModel.provider,
        providerModelId: activeModel.providerModelId,
        displayName: activeModel.displayName,
        tokensPerImage,
      }
    : null;
  const resolvedRole =
    userRole ??
    (userId ? (await getUserById(userId))?.role ?? null : null);
  const isAdmin = resolvedRole === "admin";

  if (!enabled || !userId || !modelSummary) {
    return {
      enabled,
      canGenerate: false,
      hasCredits: false,
      hasPaidPlan: false,
      hasPaidCredits: false,
      hasManualCredits: false,
      requiresPaidCredits: enabled && !isAdmin,
      isAdmin,
      tokensPerImage,
      model: modelSummary,
    };
  }

  const subscription = await getActiveSubscriptionForUser(userId);
  if (!subscription) {
    return {
      enabled,
      canGenerate: false,
      hasCredits: false,
      hasPaidPlan: false,
      hasPaidCredits: false,
      hasManualCredits: false,
      requiresPaidCredits: enabled && !isAdmin,
      isAdmin,
      tokensPerImage,
      model: modelSummary,
    };
  }

  const hasCredits = (subscription.tokenBalance ?? 0) >= tokensPerImage;
  const paidBalance = Math.max(0, subscription.paidTokenBalance ?? 0);
  const manualBalance = Math.max(0, subscription.manualTokenBalance ?? 0);
  const hasPaidCredits = paidBalance >= tokensPerImage;
  const hasManualCredits = manualBalance >= tokensPerImage;
  const plan = await getPricingPlanById({ id: subscription.planId });
  const hasPaidPlan = (plan?.priceInPaise ?? 0) > 0;

  return {
    enabled,
    canGenerate: hasCredits,
    hasCredits,
    hasPaidPlan,
    hasPaidCredits,
    hasManualCredits,
    requiresPaidCredits: false,
    isAdmin,
    tokensPerImage,
    model: modelSummary,
  };
}

function getNanoBananaClient() {
  if (!googleClient) {
    throw new ChatSDKError(
      "bad_request:configuration",
      "GOOGLE_API_KEY is missing for Nano Banana image generation."
    );
  }

  return googleClient;
}

type TranslationMode = "off" | "language" | "always";

type ImagePromptTranslation = {
  prompt: string;
  translated: boolean;
  detectedLanguage: string | null;
};

function normalizeTranslationMode(value: string): TranslationMode {
  const normalized = value.trim().toLowerCase();
  if (normalized === "off") {
    return "off";
  }
  if (normalized === "always") {
    return "always";
  }
  return "language";
}

function isKhasiLanguage(value: string | null) {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  const compact = normalized.replace(/[^a-z]/g, "");
  const target = IMAGE_TRANSLATION_LANGUAGE_CODE.toLowerCase();
  return (
    normalized === target ||
    compact === target ||
    normalized.includes("khasi") ||
    compact.includes("khasi") ||
    normalized.startsWith(target) ||
    compact.startsWith(target)
  );
}

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function resolveImagePromptTranslationModel() {
  const selectedModelId = await getAppSetting<string | null>(
    IMAGE_PROMPT_TRANSLATION_MODEL_SETTING_KEY
  );
  const normalizedModelId =
    selectedModelId && selectedModelId.trim().length > 0
      ? selectedModelId.trim()
      : null;

  if (normalizedModelId) {
    const modelConfig = await getModelConfigById({ id: normalizedModelId });
    if (modelConfig?.isEnabled) {
      try {
        return resolveLanguageModel(modelConfig);
      } catch (error) {
        console.warn(
          "Image prompt translation model unavailable, falling back to default.",
          {
            modelId: normalizedModelId,
            provider: modelConfig.provider,
            providerModelId: modelConfig.providerModelId,
          },
          error
        );
      }
    }
  }

  const client = getNanoBananaClient();
  return client.languageModel(IMAGE_TRANSLATION_MODEL_ID);
}

async function maybeTranslateImagePrompt({
  prompt,
  preferredLanguage,
  abortSignal,
}: {
  prompt: string;
  preferredLanguage?: string | null;
  abortSignal?: AbortSignal;
}): Promise<ImagePromptTranslation> {
  const mode = normalizeTranslationMode(IMAGE_TRANSLATION_MODE);
  if (mode === "off") {
    return { prompt, translated: false, detectedLanguage: null };
  }

  const model = await resolveImagePromptTranslationModel();
  const systemPrompt = [
    "You are translating prompts for image generation.",
    "Detect the language of the user's prompt.",
    mode === "always"
      ? "Translate the prompt to English regardless of its language."
      : `If it is Khasi (language code "${IMAGE_TRANSLATION_LANGUAGE_CODE}"), translate it to English.`,
    mode === "always"
      ? "Return the English translation."
      : "If it is not Khasi, return the original prompt unchanged.",
    preferredLanguage
      ? `The user's preferred language is "${preferredLanguage}". Use it only as a hint.`
      : null,
    "Return only JSON with keys: detectedLanguage, translatedPrompt.",
  ]
    .filter(Boolean)
    .join(" ");

  try {
    const result = await generateText({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      abortSignal,
    });

    const parsed = extractJsonObject(result.text.trim());
    const translatedPrompt =
      parsed && typeof parsed.translatedPrompt === "string"
        ? parsed.translatedPrompt.trim()
        : "";
    const detectedLanguage =
      parsed && typeof parsed.detectedLanguage === "string"
        ? parsed.detectedLanguage.trim()
        : null;

    if (mode === "language" && !isKhasiLanguage(detectedLanguage)) {
      return { prompt, translated: false, detectedLanguage };
    }

    if (translatedPrompt.length === 0) {
      return { prompt, translated: false, detectedLanguage };
    }

    return {
      prompt: translatedPrompt,
      translated: translatedPrompt !== prompt,
      detectedLanguage,
    };
  } catch {
    return { prompt, translated: false, detectedLanguage: null };
  }
}

type NanoBananaDiagnostics = {
  finishReason: string | null;
  candidateFinishReason: string | null;
  blockReason: string | null;
  safetySummary: string | null;
  providerError: string | null;
};

function formatSafetySummary(ratings: unknown): string | null {
  if (!Array.isArray(ratings) || ratings.length === 0) {
    return null;
  }

  const parts = ratings
    .map((rating) => {
      if (!rating || typeof rating !== "object") {
        return null;
      }
      const category =
        "category" in rating
          ? String((rating as { category?: unknown }).category ?? "unknown")
          : "unknown";
      const blocked =
        "blocked" in rating
          ? Boolean((rating as { blocked?: unknown }).blocked)
          : null;
      const severity =
        "severity" in rating
          ? String((rating as { severity?: unknown }).severity ?? "")
          : "probability" in rating
            ? String((rating as { probability?: unknown }).probability ?? "")
            : "";

      const labelParts = [category];
      if (blocked === true) {
        labelParts.push("blocked");
      }
      if (severity) {
        labelParts.push(severity);
      }
      return labelParts.join(":");
    })
    .filter((entry): entry is string => Boolean(entry));

  return parts.length > 0 ? parts.slice(0, 6).join(", ") : null;
}

function extractNanoBananaDiagnostics(result: {
  finishReason?: unknown;
  providerMetadata?: unknown;
  response?: { body?: unknown };
}): NanoBananaDiagnostics {
  const finishReason =
    typeof result.finishReason === "string" ? result.finishReason : null;

  const providerMetadata =
    result.providerMetadata && typeof result.providerMetadata === "object"
      ? result.providerMetadata
      : null;
  const googleMetadata =
    providerMetadata && "google" in providerMetadata
      ? (providerMetadata as { google?: unknown }).google
      : null;
  const promptFeedback =
    googleMetadata &&
    typeof googleMetadata === "object" &&
    "promptFeedback" in googleMetadata
      ? (googleMetadata as { promptFeedback?: unknown }).promptFeedback
      : null;

  const responseBody =
    result.response && typeof result.response === "object"
      ? (result.response as { body?: unknown }).body
      : null;

  const responseBodyObject =
    responseBody && typeof responseBody === "object" ? responseBody : null;

  const responsePromptFeedback =
    responseBodyObject && "promptFeedback" in responseBodyObject
      ? (responseBodyObject as { promptFeedback?: unknown }).promptFeedback
      : null;
  const responseCandidates =
    responseBodyObject && "candidates" in responseBodyObject
      ? (responseBodyObject as { candidates?: unknown }).candidates
      : null;
  const responseCandidate =
    Array.isArray(responseCandidates) && responseCandidates.length > 0
      ? responseCandidates[0]
      : null;

  const responseError =
    responseBodyObject && "error" in responseBodyObject
      ? (responseBodyObject as { error?: unknown }).error
      : null;
  const responseErrorMessage =
    responseError && typeof responseError === "object"
      ? [
          "status" in responseError
            ? String((responseError as { status?: unknown }).status ?? "")
            : "",
          "code" in responseError
            ? String((responseError as { code?: unknown }).code ?? "")
            : "",
          "message" in responseError
            ? String((responseError as { message?: unknown }).message ?? "")
            : "",
        ]
          .filter((entry) => entry.length > 0)
          .join(":")
      : null;

  const blockReason =
    (promptFeedback &&
    typeof promptFeedback === "object" &&
    "blockReason" in promptFeedback
      ? String((promptFeedback as { blockReason?: unknown }).blockReason ?? "")
      : "") ||
    (responsePromptFeedback &&
    typeof responsePromptFeedback === "object" &&
    "blockReason" in responsePromptFeedback
      ? String(
          (responsePromptFeedback as { blockReason?: unknown }).blockReason ?? ""
        )
      : null);

  const safetyRatings =
    (promptFeedback &&
    typeof promptFeedback === "object" &&
    "safetyRatings" in promptFeedback
      ? (promptFeedback as { safetyRatings?: unknown }).safetyRatings
      : null) ??
    (responsePromptFeedback &&
    typeof responsePromptFeedback === "object" &&
    "safetyRatings" in responsePromptFeedback
      ? (responsePromptFeedback as { safetyRatings?: unknown }).safetyRatings
      : null) ??
    (responseCandidate &&
    typeof responseCandidate === "object" &&
    "safetyRatings" in responseCandidate
      ? (responseCandidate as { safetyRatings?: unknown }).safetyRatings
      : null) ??
    (googleMetadata &&
    typeof googleMetadata === "object" &&
    "safetyRatings" in googleMetadata
      ? (googleMetadata as { safetyRatings?: unknown }).safetyRatings
      : null);

  const candidateFinishReason =
    responseCandidate && typeof responseCandidate === "object" && "finishReason" in responseCandidate
      ? String(
          (responseCandidate as { finishReason?: unknown }).finishReason ?? ""
        )
      : null;

  const safetySummary = formatSafetySummary(safetyRatings);

  return {
    finishReason,
    candidateFinishReason:
      candidateFinishReason && candidateFinishReason !== "null"
        ? candidateFinishReason
        : null,
    blockReason: blockReason && blockReason !== "null" ? blockReason : null,
    safetySummary,
    providerError:
      responseErrorMessage && responseErrorMessage !== "null"
        ? responseErrorMessage
        : null,
  };
}

function buildNoImageErrorDetails(
  diagnostics: NanoBananaDiagnostics,
  retried: boolean
) {
  const details: string[] = [];
  if (diagnostics.finishReason) {
    details.push(`finishReason=${diagnostics.finishReason}`);
  }
  if (diagnostics.candidateFinishReason) {
    details.push(`candidateFinishReason=${diagnostics.candidateFinishReason}`);
  }
  if (diagnostics.blockReason) {
    details.push(`blockReason=${diagnostics.blockReason}`);
  }
  if (diagnostics.safetySummary) {
    details.push(`safety=${diagnostics.safetySummary}`);
  }
  if (diagnostics.providerError) {
    details.push(`providerError=${diagnostics.providerError}`);
  }
  if (retried) {
    details.push("retried=true");
  }

  return details.length > 0
    ? `No image was returned from Nano Banana (${details.join(", ")})`
    : "No image was returned from Nano Banana.";
}

async function requestNanoBananaImage({
  prompt,
  image,
  abortSignal,
  modelId,
}: {
  prompt: string;
  image?: ImageInput;
  abortSignal?: AbortSignal;
  modelId: string;
}) {
  const client = getNanoBananaClient();
  const messageParts: Array<
    | { type: "text"; text: string }
    | { type: "file"; data: string; mediaType: string }
  > = [
    {
      type: "text",
      text: prompt,
    },
  ];

  if (image) {
    messageParts.push({
      type: "file",
      data: image.data,
      mediaType: image.mediaType,
    });
  }

  return generateText({
    model: client.languageModel(modelId ?? NANO_BANANA_MODEL_ID),
    messages: [
      {
        role: "user",
        content: messageParts,
      },
    ],
    providerOptions: {
      google: {
        responseModalities: ["IMAGE"],
      },
    },
    abortSignal,
  });
}

export async function generateNanoBananaImage({
  prompt,
  image,
  abortSignal,
  modelId,
  preferredLanguage,
}: {
  prompt: string;
  image?: ImageInput;
  abortSignal?: AbortSignal;
  modelId: string;
  preferredLanguage?: string | null;
}) {
  const translation = await maybeTranslateImagePrompt({
    prompt,
    preferredLanguage,
    abortSignal,
  });
  const resolvedPrompt = translation.prompt;

  const result = await requestNanoBananaImage({
    prompt: resolvedPrompt,
    image,
    abortSignal,
    modelId,
  });

  if (!result.files.length) {
    const diagnostics = extractNanoBananaDiagnostics(result);
    const shouldRetry =
      !diagnostics.blockReason &&
      diagnostics.finishReason !== "content-filter" &&
      diagnostics.finishReason !== "safety";

    if (shouldRetry) {
      const retryResult = await requestNanoBananaImage({
        prompt: resolvedPrompt,
        image,
        abortSignal,
        modelId,
      });
      if (!retryResult.files.length) {
        const retryDiagnostics = extractNanoBananaDiagnostics(retryResult);
        throw new ChatSDKError(
          "bad_request:api",
          buildNoImageErrorDetails(retryDiagnostics, true)
        );
      }

      return retryResult.files.map((file) => ({
        base64: file.base64,
        mediaType: file.mediaType,
      }));
    }

    throw new ChatSDKError(
      "bad_request:api",
      buildNoImageErrorDetails(diagnostics, false)
    );
  }

  return result.files.map((file) => ({
    base64: file.base64,
    mediaType: file.mediaType,
  }));
}
