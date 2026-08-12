export const IMAGE_INTENT_VALUES = [
  "normal_chat",
  "image_generate",
  "image_edit",
  "web_search",
  "other_tool",
] as const;

export type ImageIntent = (typeof IMAGE_INTENT_VALUES)[number];
export type RoutedImageIntent = Extract<
  ImageIntent,
  "image_generate" | "image_edit"
>;

export type ImageIntentResolution = {
  decisionToken: string;
  intent: RoutedImageIntent;
};

export type ImageIntentContextMessage = {
  role: "user" | "assistant";
  text: string;
  hasImage: boolean;
};

export type ImageIntentInput = {
  message: string;
  imageHintSelected: boolean;
  hasImageAttachment: boolean;
  hasPriorGeneratedImage: boolean;
  recentMessages: ImageIntentContextMessage[];
};

const VISUAL_CREATION_SIGNAL =
  /\b(generate|create|draw|design|illustrate|render|paint|sketch|visuali[sz]e|make)\b[\s\S]{0,80}\b(image|picture|photo|portrait|logo|poster|wallpaper|artwork|illustration|graphic)\b|\b(image|picture|photo|portrait|logo|poster|wallpaper|artwork|illustration|graphic)\b[\s\S]{0,80}\b(generate|create|draw|design|make|showing|of)\b|\b(draw|illustrate|render)\b/i;

const CONTEXTUAL_EDIT_SIGNAL =
  /\b(make|change|remove|add|replace|put|turn|edit|adjust|brighten|darken|enhance|use the same|another version|more realistic|less realistic)\b/i;

const SEMANTIC_IMAGE_ROUTING_SIGNAL =
  /\b(generate|create|make|draw|design|illustrate|render|paint|sketch|visuali[sz]e|turn)\b/i;

export function parseImageIntent(value: unknown): ImageIntent | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return IMAGE_INTENT_VALUES.find((intent) => intent === normalized) ?? null;
}

export function shouldClassifyImageIntent(input: ImageIntentInput) {
  const message = input.message.trim();
  if (!message) {
    return false;
  }
  if (input.imageHintSelected || input.hasImageAttachment) {
    return true;
  }
  if (
    VISUAL_CREATION_SIGNAL.test(message) ||
    SEMANTIC_IMAGE_ROUTING_SIGNAL.test(message)
  ) {
    return true;
  }
  return input.hasPriorGeneratedImage && CONTEXTUAL_EDIT_SIGNAL.test(message);
}

export function fallbackImageIntent(input: ImageIntentInput): ImageIntent {
  const message = input.message.trim();
  if (!message) {
    return "normal_chat";
  }
  if (VISUAL_CREATION_SIGNAL.test(message)) {
    return "image_generate";
  }
  if (
    (input.hasImageAttachment || input.hasPriorGeneratedImage) &&
    CONTEXTUAL_EDIT_SIGNAL.test(message)
  ) {
    return "image_edit";
  }
  return "normal_chat";
}

export function normalizeImageIntent(
  intent: ImageIntent,
  input: ImageIntentInput
): ImageIntent {
  if (
    intent === "image_edit" &&
    !(input.hasImageAttachment || input.hasPriorGeneratedImage)
  ) {
    return fallbackImageIntent(input) === "image_generate"
      ? "image_generate"
      : "normal_chat";
  }
  return intent;
}
