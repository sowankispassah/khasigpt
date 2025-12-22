import "server-only";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { IMAGE_GENERATION_FEATURE_FLAG_KEY, TOKENS_PER_CREDIT } from "@/lib/constants";
import { getActiveImageModel } from "@/lib/ai/image-model-registry";
import {
  getActiveSubscriptionForUser,
  getAppSetting,
  getPricingPlanById,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

const DEFAULT_NANO_BANANA_MODEL_ID = "gemini-2.5-flash-image-preview";
const NANO_BANANA_MODEL_ID =
  process.env.GOOGLE_NANO_BANANA_MODEL_ID ?? DEFAULT_NANO_BANANA_MODEL_ID;

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
}: {
  userId: string | null;
}): Promise<ImageGenerationAccess> {
  const rawSetting = await getAppSetting<string | boolean | number>(
    IMAGE_GENERATION_FEATURE_FLAG_KEY
  );
  const featureEnabled = parseImageGenerationEnabledSetting(rawSetting);
  const activeModel = await getActiveImageModel();
  const modelEnabled = Boolean(activeModel && activeModel.isEnabled);
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

  if (!enabled || !userId || !modelSummary) {
    return {
      enabled,
      canGenerate: false,
      hasCredits: false,
      hasPaidPlan: false,
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
      tokensPerImage,
      model: modelSummary,
    };
  }

  const hasCredits = (subscription.tokenBalance ?? 0) >= tokensPerImage;
  const plan = await getPricingPlanById({ id: subscription.planId });
  const hasPaidPlan = (plan?.priceInPaise ?? 0) > 0;

  return {
    enabled,
    canGenerate: hasCredits,
    hasCredits,
    hasPaidPlan,
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

export async function generateNanoBananaImage({
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

  const result = await generateText({
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

  if (!result.files.length) {
    throw new ChatSDKError(
      "bad_request:api",
      "No image was returned from Nano Banana."
    );
  }

  return result.files.map((file) => ({
    base64: file.base64,
    mediaType: file.mediaType,
  }));
}
