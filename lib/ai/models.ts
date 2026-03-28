import "server-only";

import { listModelConfigs } from "@/lib/db/queries";
import type { ModelConfig } from "@/lib/db/schema";
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
const directModelLoadTimeoutRaw = Number.parseInt(
  process.env.MODEL_REGISTRY_DB_FALLBACK_TIMEOUT_MS ?? "",
  10
);
const DIRECT_MODEL_LOAD_TIMEOUT_MS =
  Number.isFinite(directModelLoadTimeoutRaw) && directModelLoadTimeoutRaw > 0
    ? directModelLoadTimeoutRaw
    : Math.max(MODEL_LOAD_TIMEOUT_MS + 5000, 12000);

type ChatModelsResult = {
  models: ModelSummary[];
  defaultModel: ModelSummary | null;
};

type ChatModelsCacheState = {
  lastSuccessfulResult: ChatModelsResult | null;
};

type GlobalChatModelsState = typeof globalThis & {
  __chatModelsCacheState?: ChatModelsCacheState;
};

const globalChatModelsState = globalThis as GlobalChatModelsState;

const chatModelsCacheState =
  globalChatModelsState.__chatModelsCacheState ??
  ({
    lastSuccessfulResult: null,
  } satisfies ChatModelsCacheState);

globalChatModelsState.__chatModelsCacheState ??= chatModelsCacheState;

function buildChatModelsResult(
  configs: ModelConfig[],
  defaultConfig?: ModelConfig | null
): ChatModelsResult {
  const models = configs.map(mapToModelSummary);
  const resolvedDefaultConfig =
    defaultConfig ?? configs.find((config) => config.isDefault) ?? configs[0] ?? null;

  return {
    models,
    defaultModel: resolvedDefaultConfig ? mapToModelSummary(resolvedDefaultConfig) : null,
  };
}

function rememberChatModels(result: ChatModelsResult): ChatModelsResult {
  if (result.models.length > 0) {
    chatModelsCacheState.lastSuccessfulResult = result;
  }
  return result;
}

async function loadChatModelsFromRegistry(): Promise<ChatModelsResult> {
  const { configs, defaultConfig } = await withTimeout(
    getModelRegistry(),
    MODEL_LOAD_TIMEOUT_MS,
    () => {
      console.warn(
        `[models] Model registry timed out after ${MODEL_LOAD_TIMEOUT_MS}ms; retrying with direct database read.`
      );
    }
  );

  return buildChatModelsResult(configs, defaultConfig);
}

async function loadChatModelsDirectly(): Promise<ChatModelsResult> {
  const configs = await withTimeout(
    listModelConfigs(),
    DIRECT_MODEL_LOAD_TIMEOUT_MS,
    () => {
      console.warn(
        `[models] Direct model config query timed out after ${DIRECT_MODEL_LOAD_TIMEOUT_MS}ms.`
      );
    }
  );

  return buildChatModelsResult(configs);
}

export async function loadChatModels() {
  try {
    return rememberChatModels(await loadChatModelsFromRegistry());
  } catch (registryError) {
    try {
      console.warn(
        "[models] Falling back to direct model query after registry load failure."
      );
      return rememberChatModels(await loadChatModelsDirectly());
    } catch (directError) {
      if (chatModelsCacheState.lastSuccessfulResult) {
        console.warn(
          "[models] Using last successful model list after transient load failure."
        );
        return chatModelsCacheState.lastSuccessfulResult;
      }

      console.error("Failed to load chat models, using fallback model.", {
        registryError,
        directError,
      });
    }

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
