import "server-only";

import { generateText } from "ai";
import { getModelRegistry } from "@/lib/ai/model-registry";
import { resolveLanguageModel } from "@/lib/ai/providers";
import {
  fallbackImageIntent,
  type ImageIntent,
  type ImageIntentInput,
  normalizeImageIntent,
  parseImageIntent,
} from "@/lib/image-intent";
import { withTimeout } from "@/lib/utils/async";

const IMAGE_INTENT_TIMEOUT_MS = 6000;
const MAX_CONTEXT_MESSAGES = 6;
const MAX_CONTEXT_MESSAGE_CHARS = 500;

function compactClassifierInput(input: ImageIntentInput): ImageIntentInput {
  return {
    ...input,
    recentMessages: input.recentMessages
      .slice(-MAX_CONTEXT_MESSAGES)
      .map((message) => ({
        ...message,
        text: message.text.slice(0, MAX_CONTEXT_MESSAGE_CHARS),
      })),
  };
}

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function classifyImageIntent(
  input: ImageIntentInput
): Promise<ImageIntent> {
  const fallback = fallbackImageIntent(input);

  try {
    const registry = await getModelRegistry();
    const modelConfig =
      (registry.defaultConfig?.supportsReasoning
        ? registry.configs.find((config) => !config.supportsReasoning)
        : registry.defaultConfig) ?? registry.configs[0];
    if (!modelConfig) {
      return fallback;
    }

    const result = await withTimeout(
      generateText({
        model: resolveLanguageModel(modelConfig),
        system: [
          "Classify the user's current request for a multimodal chat router.",
          "Return strict JSON only: {\"intent\":\"normal_chat|image_generate|image_edit|web_search|other_tool\"}.",
          "The current message has priority over the selected UI hint.",
          "Classify by meaning and conversational context in any language, including Khasi, English, Hindi, mixed-language text, transliteration, and imperfect spelling. Never depend on a fixed keyword list.",
          "Use image_generate only when the user is asking to create a new image, drawing, logo, visual, or wholly new version.",
          "A visual request may be only a terse scene or composition with no command verb or image noun. For example, 'Tirot Sing flying as Superman' and Khasi 'U Tirot Sing ba her kum u Superman' are image_generate.",
          "Use image_edit only when the user asks to modify an attached image or a prior generated image.",
          "A new subject or an explicitly completely different image is image_generate, even if a prior image exists.",
          "Use recentMessages to resolve follow-ups, pronouns, omitted subjects, and whether the user is continuing an image request or returning to ordinary conversation.",
          "Acknowledgments, thanks, praise, criticism, questions, explanations, and comparisons are normal_chat unless they clearly request a visual change.",
          "Biographical, identity, clothing-information, and other factual questions remain normal_chat even when they mention visually descriptive words.",
          "The image UI hint expresses preference but never forces an image intent.",
          "Use web_search for a request whose primary action is current web research, and other_tool for another clearly requested tool action.",
          "Interpret natural phrasing and conversational references semantically; do not rely on exact keywords.",
        ].join("\n"),
        prompt: JSON.stringify(compactClassifierInput(input)),
        temperature: 0,
        maxOutputTokens: 30,
      }),
      IMAGE_INTENT_TIMEOUT_MS
    );

    const parsed = extractJsonObject(result.text.trim());
    const intent = parseImageIntent(parsed?.intent);
    return normalizeImageIntent(intent ?? fallback, input);
  } catch (error) {
    console.warn("[image-intent] Semantic classification failed.", {
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}
