export const IMAGE_GENERATION_SAFETY_ERROR_CODE =
  "image_generation_safety_rejected";
export const IMAGE_GENERATION_SAFETY_MESSAGE =
  "Couldn’t complete this image because the request was blocked by a safety check. Try changing the prompt and try again.";
export const IMAGE_GENERATION_FAILED_MESSAGE =
  "Couldn’t complete this image. Please try again.";

const SAFETY_REJECTION_MARKERS = [
  "blockreason=safety",
  "content-filter",
  "content moderation",
  "content policy",
  "finishreason=safety",
  "moderation block",
  "safety check",
  "safety filter",
  "safety=",
  "sensitive information",
  "unsafe content",
] as const;

export function isImageGenerationSafetyRejection(error: unknown) {
  const details =
    error &&
    typeof error === "object" &&
    "cause" in error &&
    typeof error.cause === "string"
      ? error.cause
      : error instanceof Error
        ? error.message
        : "";
  const normalized = details.toLowerCase();

  return SAFETY_REJECTION_MARKERS.some((marker) =>
    normalized.includes(marker)
  );
}
