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

const MODEL_LOAD_TIMEOUT_MS = 3500;

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

function requireUsableChatModels(
  result: ChatModelsResult,
  source: "registry" | "direct"
) {
  if (result.models.length > 0 && result.defaultModel) {
    return result;
  }

  throw new Error(`No usable chat models returned from ${source} model load.`);
}

async function loadChatModelsFromRegistry(): Promise<ChatModelsResult> {
  const { configs, defaultConfig } = await withTimeout(
    getModelRegistry(),
    MODEL_LOAD_TIMEOUT_MS,
    () => {
      console.error("[models] Registry model load timed out.", {
        timeoutMs: MODEL_LOAD_TIMEOUT_MS,
      });
    }
  );

  return requireUsableChatModels(
    buildChatModelsResult(configs, defaultConfig),
    "registry"
  );
}

async function loadChatModelsDirectly(): Promise<ChatModelsResult> {
  const configs = await withTimeout(
    listModelConfigs(),
    MODEL_LOAD_TIMEOUT_MS,
    () => {
      console.error("[models] Direct model load timed out.", {
        timeoutMs: MODEL_LOAD_TIMEOUT_MS,
      });
    }
  );

  return requireUsableChatModels(buildChatModelsResult(configs), "direct");
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
