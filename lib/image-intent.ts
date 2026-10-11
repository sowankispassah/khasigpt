import {
  isConversationalAcknowledgement,
  isConversationalGreeting,
} from "@/lib/chat/assistant-text-safety";

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
  decisionToken?: string;
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

const SOURCE_DEPENDENT_EDIT_SIGNAL =
  /\b(?:make|change|edit|adjust|remove|replace|turn|brighten|darken)\b[\s\S]{0,80}\b(?:it|this|that|same|previous|last|existing)\b/i;

const NON_VISUAL_REQUEST_PREFIX =
  /^(?:who|what|when|where|why|how|which|is|are|was|were|do|does|did|can|could|would|should|tell|explain|describe|define|translate|write|compare|list|find|search|pynwad|batai|mano|aiu|mynno|hangno|balei|kumno)\b/i;

const EXPLICIT_TEXT_REQUEST_PREFIX =
  /^(?:please\s+)?(?:write|compose|draft|summarize|explain|describe|translate|thoh|batai|pynshai|pynkylla)\b|^(?:i|we|nga|ngi)\s+(?:bought|purchased|have|had|like|love|think|feel|thied|sngewtynnad)\b/i;

/** A selected image control disambiguates a terse scene without an image verb. */
export function isImageModeScenePrompt(message: string) {
  const normalized = message.trim().replace(/\s+/g, " ");
  const wordCount = normalized ? normalized.split(" ").length : 0;
  return (
    wordCount >= 2 &&
    wordCount <= 40 &&
    !normalized.endsWith("?") &&
    !isConversationalAcknowledgement(normalized) &&
    !isConversationalGreeting(normalized) &&
    !NON_VISUAL_REQUEST_PREFIX.test(normalized) &&
    !EXPLICIT_TEXT_REQUEST_PREFIX.test(normalized)
  );
}

const STANDALONE_VISUAL_COMPOSITION_SIGNAL =
  /\b(?:as|kum)\s+(?:an?\s+)?\S+|\b(?:flying|wearing|dressed|standing|sitting|riding|holding|walking|running|beneath|amid|against)\b|\b(?:ba\s+her|ba\s+phong|jaiñsem|jainsem)\b|\b(?:in|ha)\s+(?:\S+\s+){0,4}(?:dress|attire|clothes|clothing|costume|uniform|jaiñsem|jainsem)\b/i;

export function isStandaloneVisualComposition(message: string) {
  const normalized = message.trim().replace(/\s+/g, " ");
  if (
    !normalized ||
    normalized.endsWith("?") ||
    NON_VISUAL_REQUEST_PREFIX.test(normalized)
  ) {
    return false;
  }

  const wordCount = normalized.split(" ").length;
  return (
    wordCount >= 3 &&
    wordCount <= 30 &&
    STANDALONE_VISUAL_COMPOSITION_SIGNAL.test(normalized)
  );
}

export function parseImageIntent(value: unknown): ImageIntent | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return IMAGE_INTENT_VALUES.find((intent) => intent === normalized) ?? null;
}

export function shouldClassifyImageIntent(input: ImageIntentInput) {
  const message = input.message.trim();
  return (
    Boolean(message) &&
    !isConversationalAcknowledgement(message) &&
    !isConversationalGreeting(message)
  );
}

export function fallbackImageIntent(input: ImageIntentInput): ImageIntent {
  const message = input.message.trim();
  if (
    !message ||
    isConversationalAcknowledgement(message) ||
    isConversationalGreeting(message)
  ) {
    return "normal_chat";
  }
  if (VISUAL_CREATION_SIGNAL.test(message)) {
    return "image_generate";
  }
  if (isStandaloneVisualComposition(message)) {
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
    isConversationalAcknowledgement(input.message) ||
    isConversationalGreeting(input.message)
  ) {
    return "normal_chat";
  }
  if (
    intent === "normal_chat" &&
    input.imageHintSelected &&
    isImageModeScenePrompt(input.message)
  ) {
    const fallback = fallbackImageIntent(input);
    if (fallback === "image_edit") {
      return "image_edit";
    }
    if (
      !input.hasImageAttachment &&
      !input.hasPriorGeneratedImage &&
      SOURCE_DEPENDENT_EDIT_SIGNAL.test(input.message)
    ) {
      return "normal_chat";
    }
    return "image_generate";
  }
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

/** Only show the image tile before routing when the local intent is visual. */
export function shouldShowImageLoading(input: ImageIntentInput) {
  if (!input.imageHintSelected) {
    return false;
  }
  const intent = normalizeImageIntent(fallbackImageIntent(input), input);
  return intent === "image_generate" || intent === "image_edit";
}
