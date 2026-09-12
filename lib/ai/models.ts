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
  degraded?: boolean;
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

const MODEL_LOAD_TIMEOUT_MS = 2500;

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
    const registryTimedOut =
      registryError instanceof Error && registryError.message === "timeout";
    if (!registryTimedOut) {
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
          return { ...chatModelsCacheState.lastSuccessfulResult, degraded: true };
        }

        console.error("Failed to confirm chat model configuration.", {
          registryError,
          directError,
        });
      }
    } else if (chatModelsCacheState.lastSuccessfulResult) {
      console.warn(
        "[models] Using last successful model list after registry timeout."
      );
      return { ...chatModelsCacheState.lastSuccessfulResult, degraded: true };
    } else {
      console.warn(
        "[models] Registry model load timed out. Returning unconfirmed configuration without a second blocking DB attempt."
      );
    }

    return {
      degraded: true,
      models: [],
      defaultModel: null,
    };
  }
}

export const CHAT_MODELS_CACHE_TAG = MODEL_REGISTRY_CACHE_TAG;
