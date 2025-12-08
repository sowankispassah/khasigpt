import "server-only";

import { unstable_cache } from "next/cache";

import {
  getModelRegistry,
  MODEL_REGISTRY_CACHE_TAG,
  type ModelSummary,
  mapToModelSummary,
} from "./model-registry";

export type ChatModel = ModelSummary;

const CHAT_MODELS_CACHE_KEY = "chat-models";

export const loadChatModels = unstable_cache(
  async () => {
    try {
      const { configs, defaultConfig } = await getModelRegistry();

      const models = configs.map(mapToModelSummary);
      const defaultModel = defaultConfig
        ? mapToModelSummary(defaultConfig)
        : null;

      return {
        models,
        defaultModel,
      };
    } catch (error) {
      console.error("Failed to load chat models, using fallback model.", error);

      const fallbackModel: ModelSummary = {
        id: "fallback-openai-gpt-4o-mini",
        key: "openai-gpt-4o-mini",
        provider: "openai",
        providerModelId: "gpt-4o-mini",
        name: "GPT-4o mini",
        description:
          "Fallback configuration when database access is unavailable.",
        supportsReasoning: false,
        reasoningTag: null,
        systemPrompt:
          "You are a helpful AI assistant. Offer concise, accurate, and friendly responses.",
        codeTemplate: null,
        inputProviderCostPerMillion: 0,
        outputProviderCostPerMillion: 0,
        freeMessagesPerDay: 3,
      };

      return {
        models: [fallbackModel],
        defaultModel: fallbackModel,
      };
    }
  },
  [CHAT_MODELS_CACHE_KEY],
  { tags: [MODEL_REGISTRY_CACHE_TAG] }
);
