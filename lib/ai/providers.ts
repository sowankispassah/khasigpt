import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import {
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import type { ModelConfig } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";

const openaiClient =
  process.env.OPENAI_API_KEY !== undefined
    ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

const anthropicClient =
  process.env.ANTHROPIC_API_KEY !== undefined
    ? createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : null;

const googleClient =
  process.env.GOOGLE_API_KEY !== undefined
    ? createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY })
    : null;

const DEFAULT_TITLE_MODEL = "gpt-4o-mini";

function ensureClient<T>(client: T | null, name: string): T {
  if (!client) {
    throw new ChatSDKError(
      "bad_request:api",
      `${name} provider requires a valid API key`
    );
  }

  return client;
}

export function resolveLanguageModel(config: ModelConfig): LanguageModelV2 {
  const baseModel = (() => {
    switch (config.provider) {
      case "openai": {
        const client = ensureClient(openaiClient, "OpenAI");
        return client.languageModel(config.providerModelId);
      }
      case "anthropic": {
        const client = ensureClient(anthropicClient, "Anthropic");
        return client.languageModel(config.providerModelId);
      }
      case "google": {
        const client = ensureClient(googleClient, "Google Gemini");
        return client.languageModel(config.providerModelId);
      }
      default:
        throw new ChatSDKError(
          "bad_request:api",
          `Unsupported provider: ${config.provider}`
        );
    }
  })();

  if (config.supportsReasoning && config.reasoningTag) {
    return wrapLanguageModel({
      model: baseModel,
      middleware: extractReasoningMiddleware({
        tagName: config.reasoningTag,
      }),
    });
  }

  return baseModel;
}

export function getTitleLanguageModel(
  preferredModel?: ModelConfig | null
): LanguageModelV2 {
  if (preferredModel) {
    try {
      return resolveLanguageModel(preferredModel);
    } catch (error) {
      console.warn(
        "Preferred title model unavailable, falling back to default",
        {
          provider: preferredModel.provider,
          modelId: preferredModel.providerModelId,
        },
        error
      );
    }
  }

  const client = ensureClient(openaiClient, "OpenAI");
  return client.languageModel(DEFAULT_TITLE_MODEL);
}

export function getArtifactLanguageModel(): LanguageModelV2 {
  const client = ensureClient(openaiClient, "OpenAI");
  return client.languageModel(DEFAULT_TITLE_MODEL);
}
