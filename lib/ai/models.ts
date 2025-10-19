import "server-only";

import { cache } from "react";

import {
  getModelRegistry,
  mapToModelSummary,
  type ModelSummary,
} from "./model-registry";

export type ChatModel = ModelSummary;

export const loadChatModels = cache(async () => {
  try {
    const { configs, defaultConfig } = await getModelRegistry();

    const models = configs.map(mapToModelSummary);
    const defaultModel = defaultConfig ? mapToModelSummary(defaultConfig) : null;

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
      inputCostPerMillion: 0,
      outputCostPerMillion: 0,
    };

    return {
      models: [fallbackModel],
      defaultModel: fallbackModel,
    };
  }
});
