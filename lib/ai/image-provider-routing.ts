export type ImageProviderAdapter =
  | "bfl"
  | "byteplus"
  | "gateway"
  | "google"
  | "openai"
  | "xai";

const GOOGLE_DEFAULT_MAX_REFERENCE_IMAGES = 3;
const GOOGLE_GEMINI_3_MAX_REFERENCE_IMAGES = 14;
const XAI_MAX_REFERENCE_IMAGES = 3;
const OPENAI_MAX_REFERENCE_IMAGES = 16;
const BFL_MAX_REFERENCE_IMAGES = 8;
const BYTEPLUS_MAX_REFERENCE_IMAGES = 14;
const GATEWAY_MAX_REFERENCE_IMAGES = 10;

const XAI_MODEL_ALIASES: Record<string, string> = {
  "grok-imagine-image-2.0": "grok-imagine-image-quality",
};

const BYTEPLUS_MODEL_ALIASES: Record<string, string> = {
  "seedream-5.0-lite": "seedream-5-0-260128",
  "seedream-5-0-lite": "seedream-5-0-260128",
  "seedream-5-0-lite-260128": "seedream-5-0-260128",
};

export function resolveImageProviderAdapter({
  provider,
  providerModelId,
}: {
  provider: string;
  providerModelId: string;
}): ImageProviderAdapter | null {
  const normalizedProvider = provider.trim().toLowerCase();
  const normalizedModelId = providerModelId.trim().toLowerCase();

  if (normalizedProvider === "google") {
    return "google";
  }
  if (normalizedProvider === "openai") {
    return "openai";
  }
  if (normalizedProvider !== "custom") {
    return null;
  }

  if (
    normalizedModelId.startsWith("bytedance/seedream-") ||
    normalizedModelId.startsWith("byteplus/seedream-") ||
    normalizedModelId.startsWith("dola-seedream-") ||
    normalizedModelId.startsWith("seedream-")
  ) {
    return "byteplus";
  }
  if (
    normalizedModelId.startsWith("grok-") ||
    normalizedModelId.startsWith("xai/")
  ) {
    return "xai";
  }
  if (
    normalizedModelId.startsWith("flux-") ||
    normalizedModelId.startsWith("bfl/")
  ) {
    return "bfl";
  }
  if (normalizedModelId.includes("/")) {
    return "gateway";
  }

  return null;
}

export function normalizeImageProviderModelId({
  adapter,
  providerModelId,
}: {
  adapter: ImageProviderAdapter;
  providerModelId: string;
}) {
  let normalized = providerModelId.trim();
  const prefix = `${adapter}/`;
  if (normalized.toLowerCase().startsWith(prefix)) {
    normalized = normalized.slice(prefix.length);
  }

  if (adapter === "xai") {
    return XAI_MODEL_ALIASES[normalized.toLowerCase()] ?? normalized;
  }
  if (adapter === "byteplus") {
    if (normalized.toLowerCase().startsWith("bytedance/")) {
      normalized = normalized.slice("bytedance/".length);
    }
    return BYTEPLUS_MODEL_ALIASES[normalized.toLowerCase()] ?? normalized;
  }

  return normalized;
}

export function getMaxReferenceImagesForProviderModel({
  provider,
  providerModelId,
}: {
  provider: string;
  providerModelId: string;
}) {
  const adapter = resolveImageProviderAdapter({ provider, providerModelId });
  if (adapter === "xai") {
    return XAI_MAX_REFERENCE_IMAGES;
  }
  if (adapter === "openai") {
    return OPENAI_MAX_REFERENCE_IMAGES;
  }
  if (adapter === "bfl") {
    return BFL_MAX_REFERENCE_IMAGES;
  }
  if (adapter === "byteplus") {
    return BYTEPLUS_MAX_REFERENCE_IMAGES;
  }
  if (adapter === "gateway") {
    return GATEWAY_MAX_REFERENCE_IMAGES;
  }

  const normalizedModelId = providerModelId.trim().toLowerCase();
  if (
    normalizedModelId.includes("gemini-3.1-flash-image") ||
    normalizedModelId.includes("gemini-3-pro-image")
  ) {
    return GOOGLE_GEMINI_3_MAX_REFERENCE_IMAGES;
  }

  return GOOGLE_DEFAULT_MAX_REFERENCE_IMAGES;
}
