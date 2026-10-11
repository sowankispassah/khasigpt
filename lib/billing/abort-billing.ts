import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
} from "@ai-sdk/provider";
import { wrapLanguageModel } from "ai";
import { estimateTokenCountFromText } from "@/lib/billing/cost-plus";

type Prompt = LanguageModelV2CallOptions["prompt"];

// Close to what OpenAI, Anthropic and Gemini bill for a typical chat image
// (Anthropic: about 1,600 tokens for a 1.15 MP image).
const ABORTED_IMAGE_INPUT_TOKENS = 1600;
// Role and formatting tokens each provider adds around a message.
const ABORTED_MESSAGE_OVERHEAD_TOKENS = 4;

function utf8TokenEstimate(text: string) {
  return Math.ceil(Buffer.byteLength(text, "utf8") / 4);
}

/**
 * Input tokens to charge for a paid prompt the provider received but never
 * reported usage for. Admission's allowance is a deliberate upper bound
 * (one token per byte plus fixed headroom), so charging it would overbill an
 * honest Stop several times over. UTF-8 bytes / 4 matches English closely and
 * keeps non-Latin scripts from paying far less than their real token count.
 */
export function abortedInputTokenEstimate(prompt: Prompt) {
  let tokens = 0;
  for (const message of prompt) {
    tokens += ABORTED_MESSAGE_OVERHEAD_TOKENS;
    if (typeof message.content === "string") {
      tokens += utf8TokenEstimate(message.content);
      continue;
    }
    for (const part of message.content) {
      if (part.type === "file") {
        tokens += part.mediaType.startsWith("image/")
          ? ABORTED_IMAGE_INPUT_TOKENS
          : 0;
        continue;
      }
      tokens += utf8TokenEstimate(
        "text" in part && typeof part.text === "string"
          ? part.text
          : JSON.stringify(part)
      );
    }
  }
  return tokens;
}

/**
 * Wrap the provider model inside budgetedModel. A streamed request reaches
 * this layer only after admission passed and just before the provider call,
 * so onDispatch marks a request the provider will bill. The estimate is
 * computed lazily: a stream that finishes normally does no extra work.
 */
export function observeDispatchedInput(
  model: LanguageModelV2,
  onDispatch: (inputTokenEstimate: () => number) => void
) {
  return wrapLanguageModel({
    model,
    middleware: {
      middlewareVersion: "v2",
      transformParams: async ({ type, params }) => {
        if (type === "stream") {
          onDispatch(() => abortedInputTokenEstimate(params.prompt));
        }
        return params;
      },
    },
  });
}

export type UnfinishedGenerationUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type AbortedGenerationUsage<ProviderUsage> =
  | { source: "provider"; usage: ProviderUsage }
  | { source: "estimate"; usage: UnfinishedGenerationUsage }
  | null;

/**
 * Usage to record when a client aborts a stream.
 *
 * Provider usage from a finished step always wins. Without it, a paid request
 * that reached the provider is charged its estimated input plus the streamed
 * text and reasoning. Free requests keep the earlier estimate: the
 * display text estimate for input and streamed text only, and nothing when no
 * text arrived. null means there is nothing to record.
 */
export function resolveAbortedGenerationUsage<ProviderUsage>({
  admittedInputEstimate,
  fallbackInputTokens,
  paid,
  providerUsage,
  streamedReasoning,
  streamedText,
}: {
  /** From observeDispatchedInput; null when no paid request reached the provider. */
  admittedInputEstimate: (() => number) | null;
  fallbackInputTokens: number;
  paid: boolean;
  providerUsage: ProviderUsage | null;
  streamedReasoning: string;
  streamedText: string;
}): AbortedGenerationUsage<ProviderUsage> {
  if (providerUsage) {
    return { source: "provider", usage: providerUsage };
  }

  const textTokens = estimateTokenCountFromText(streamedText);
  if (paid && admittedInputEstimate) {
    const inputTokens = Math.max(1, Math.round(admittedInputEstimate()));
    const outputTokens =
      textTokens + estimateTokenCountFromText(streamedReasoning);
    return {
      source: "estimate",
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    };
  }

  if (textTokens === 0) {
    return null;
  }
  const inputTokens = Math.max(1, fallbackInputTokens || 1);
  return {
    source: "estimate",
    usage: {
      inputTokens,
      outputTokens: textTokens,
      totalTokens: inputTokens + textTokens,
    },
  };
}
