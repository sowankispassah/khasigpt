import "server-only";

import { withTimeout } from "@/lib/utils/async";
import {
  getModelRegistry,
  MODEL_REGISTRY_CACHE_TAG,
  type ModelSummary,
  mapToModelSummary,
} from "./model-registry";

export type ChatModel = ModelSummary;

const modelLoadTimeoutRaw = Number.parseInt(
  process.env.MODEL_REGISTRY_TIMEOUT_MS ?? "",
  10
);
const MODEL_LOAD_TIMEOUT_MS =
  Number.isFinite(modelLoadTimeoutRaw) && modelLoadTimeoutRaw > 0
    ? modelLoadTimeoutRaw
    : 7000;

export async function loadChatModels() {
  try {
    const { configs, defaultConfig } = await withTimeout(
      getModelRegistry(),
      MODEL_LOAD_TIMEOUT_MS,
      () => {
        console.warn(
          `[models] Model registry timed out after ${MODEL_LOAD_TIMEOUT_MS}ms; falling back.`
        );
      }
    );

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
      description: "Fallback configuration when database access is unavailable.",
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
}

export const CHAT_MODELS_CACHE_TAG = MODEL_REGISTRY_CACHE_TAG;
