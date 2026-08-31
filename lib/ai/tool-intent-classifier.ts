import "server-only";

import { generateText } from "ai";
import { getModelRegistry } from "@/lib/ai/model-registry";
import { resolveLanguageModel } from "@/lib/ai/providers";
import {
  fallbackImageIntent,
  normalizeImageIntent,
} from "@/lib/image-intent";
import {
  type SemanticWebSearchDecision,
  type ToolIntentDecision,
  type ToolIntentInput,
  WEB_SEARCH_KIND_VALUES,
  WEB_SEARCH_REASON_VALUES,
} from "@/lib/tool-intent";
import { withTimeout } from "@/lib/utils/async";
import { detectWebSearchNeed, resolveWebSearchQuery } from "@/lib/web-search/detection";

const TOOL_INTENT_TIMEOUT_MS = 6000;
const MAX_CONTEXT_MESSAGES = 6;
const MAX_CONTEXT_MESSAGE_CHARS = 500;
const MAX_SEARCH_QUERY_CHARS = 500;

function compactClassifierInput(input: ToolIntentInput): ToolIntentInput {
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

function normalizeSearchQuery(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback.trim().slice(0, MAX_SEARCH_QUERY_CHARS);
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return (normalized || fallback.trim()).slice(0, MAX_SEARCH_QUERY_CHARS);
}

function preserveNumericConstraints(query: string, originalMessage: string) {
  const requiredNumbers = Array.from(
    new Set(originalMessage.match(/\d[\d,]*(?:\.\d+)?/g) ?? [])
  );
  const missingNumbers = requiredNumbers.filter(
    (number) =>
      !query.replaceAll(",", "").includes(number.replaceAll(",", ""))
  );
  return [...query.split(/\s+/), ...missingNumbers]
    .filter(Boolean)
    .join(" ")
    .slice(0, MAX_SEARCH_QUERY_CHARS);
}

function parseWebSearchDecision(
  parsed: Record<string, unknown>,
  input: ToolIntentInput
): SemanticWebSearchDecision | null {
  if (parsed.intent !== "web_search") {
    return null;
  }
  const kind = WEB_SEARCH_KIND_VALUES.find((value) => value === parsed.kind);
  const reason = WEB_SEARCH_REASON_VALUES.find(
    (value) => value === parsed.reason
  );
  const confidence =
    parsed.confidence === "high" || parsed.confidence === "medium"
      ? parsed.confidence
      : null;
  if (!(kind && reason && confidence)) {
    return null;
  }
  const previousUserMessages = input.recentMessages
    .filter((message) => message.role === "user")
    .map((message) => message.text);
  return {
    confidence,
    kind,
    query: preserveNumericConstraints(
      normalizeSearchQuery(
        parsed.query,
        resolveWebSearchQuery({
          currentText: input.message,
          previousUserMessages,
        })
      ),
      input.message
    ),
    reason,
  };
}

function fallbackToolIntent(input: ToolIntentInput): ToolIntentDecision {
  const imageIntent = normalizeImageIntent(fallbackImageIntent(input), input);
  if (imageIntent === "image_generate" || imageIntent === "image_edit") {
    return { intent: imageIntent, webSearch: null };
  }

  const webDecision = detectWebSearchNeed(input.message);
  if (!webDecision.shouldSearch) {
    return { intent: "normal_chat", webSearch: null };
  }
  return {
    intent: "web_search",
    webSearch: {
      confidence: "high",
      kind: webDecision.hasShoppingIntent
        ? "shopping"
        : webDecision.hasVideoIntent
          ? "video"
          : "general",
      query: resolveWebSearchQuery({
        currentText: input.message,
        previousUserMessages: input.recentMessages
          .filter((message) => message.role === "user")
          .map((message) => message.text),
      }),
      reason: webDecision.hasShoppingIntent
        ? "shopping_discovery"
        : webDecision.hasVideoIntent
          ? "video_discovery"
          : webDecision.hasExplicitWebIntent
            ? "explicit_search"
            : "current_information",
    },
  };
}

export async function classifyToolIntent(
  input: ToolIntentInput
): Promise<ToolIntentDecision> {
  const fallback = fallbackToolIntent(input);

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
          "Route the user's current message to exactly one chat capability.",
          'Return strict JSON only: {"intent":"normal_chat|image_generate|image_edit|web_search|other_tool","kind":"general|shopping|news|video|null","confidence":"high|medium|low","reason":"explicit_search|current_information|shopping_discovery|current_availability|news_update|video_discovery|contextual_followup|general_knowledge|creative_request|acknowledgement|ambiguous","query":"string|null"}.',
          "Classify by meaning and conversational context in any language, never by a fixed keyword list.",
          "Treat Khasi, English, Hindi, mixed-language text, romanized or transliterated text, spelling variation, and natural paraphrases equally.",
          "Use web_search when a correct answer requires finding current external information, current availability, products, prices, places, news, videos, or when the user explicitly asks to search or look something up.",
          "Use shopping for product discovery or purchase availability. A request such as 'find me a t-shirt under 500 rupees' and Khasi 'pynwad t-shirt ba hapoh 500 tyngka' are the same shopping intent.",
          "Preserve every constraint in query: product, maximum or minimum amount, currency, location, brand, size, date, and requested source. Translate generic words into concise search-friendly English when useful, but never translate names or invent constraints.",
          "Use recentMessages to resolve follow-ups. After search results, 'are these still available?' is web_search/current_availability; a bare 'thanks' or opinion is normal_chat.",
          "A product-filter follow-up such as Khasi 'Tang kiba rong ïong' continues the prior shopping search, while 'Khublei' does not search again.",
          "Questions answerable from stable general knowledge, writing or brainstorming requests, and references to something the user already bought are normal_chat.",
          "For example, 'Explain photosynthesis' and Khasi 'Batai ïa ka photosynthesis' are both normal_chat; 'Write a poem about rain' and Khasi 'Thoh poem shaphang u slap' are both normal_chat.",
          "Do not search for 'find the derivative', 'write a story under 500 words', 'recommend a poem', or 'suggest a name'. Numbers alone never imply shopping.",
          "Use image_generate only when the user asks to create a new visual. A terse scene or composition can be an image request without a command verb or image noun.",
          "For example, 'Tirot Sing flying as Superman' and Khasi 'U Tirot Sing ba her kum u Superman' are both image_generate.",
          "Use image_edit only when the user asks to modify an attached image or a prior generated image. A new subject or explicitly different image is image_generate.",
          "The current message has priority over the selected image UI hint. The hint expresses preference but never forces an image intent.",
          "Only choose web_search with high or medium confidence. If uncertain, choose normal_chat with low confidence.",
          "For non-web intents, kind and query must be null.",
        ].join("\n"),
        prompt: JSON.stringify(compactClassifierInput(input)),
        temperature: 0,
        maxOutputTokens: 140,
      }),
      TOOL_INTENT_TIMEOUT_MS
    );

    const parsed = extractJsonObject(result.text.trim());
    if (!parsed || typeof parsed.intent !== "string") {
      return fallback;
    }
    const webSearch = parseWebSearchDecision(parsed, input);
    if (parsed.intent === "web_search") {
      return webSearch
        ? { intent: "web_search", webSearch }
        : { intent: "normal_chat", webSearch: null };
    }
    if (parsed.intent === "image_generate" || parsed.intent === "image_edit") {
      const intent = normalizeImageIntent(parsed.intent, input);
      return { intent, webSearch: null };
    }
    if (parsed.intent === "other_tool") {
      return { intent: "other_tool", webSearch: null };
    }
    return { intent: "normal_chat", webSearch: null };
  } catch (error) {
    console.warn("[tool-intent] Semantic classification unavailable.", {
      reason: error instanceof Error ? error.name : "classification_failed",
    });
    return fallback;
  }
}
