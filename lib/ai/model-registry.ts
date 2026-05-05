import "server-only";

import { unstable_cache } from "next/cache";

import {
  getModelConfigById,
  listModelConfigs,
} from "@/lib/db/queries";
import type { ModelConfig } from "@/lib/db/schema";

export const MODEL_REGISTRY_CACHE_TAG = "model-registry";
const MODEL_REGISTRY_CACHE_KEY = "model-registry-v2";
const modelRegistryRevalidateRaw = Number.parseInt(
  process.env.MODEL_REGISTRY_REVALIDATE_SECONDS ?? "",
  10
);
const MODEL_REGISTRY_REVALIDATE_SECONDS =
  Number.isFinite(modelRegistryRevalidateRaw) && modelRegistryRevalidateRaw > 0
    ? modelRegistryRevalidateRaw
    : 300;

async function ensureModelConfigs(): Promise<ModelConfig[]> {
  const existingAll = await listModelConfigs({ includeDisabled: true });
  const enabled = existingAll.filter((config) => config.isEnabled);

  if (enabled.length > 0) {
    return enabled;
  }

  if (existingAll.length > 0) {
    console.error(
      "[models] No enabled model configs found. User-facing reads will use the in-memory fallback model until an admin enables a model."
    );
    return [];
  }

  console.error(
    "[models] No model configs found. User-facing reads will use the in-memory fallback model until an admin creates a model."
  );
  return [];
}

export const getModelRegistry = unstable_cache(
  async () => {
    const configs = await ensureModelConfigs();
    const defaultConfig =
      configs.find((config) => config.isDefault) ?? configs[0] ?? null;

    return {
      configs,
      defaultConfig,
    };
  },
  [MODEL_REGISTRY_CACHE_KEY],
  { tags: [MODEL_REGISTRY_CACHE_TAG], revalidate: MODEL_REGISTRY_REVALIDATE_SECONDS }
);

export async function getModelConfigOrThrow(id: string): Promise<ModelConfig> {
  const config = await getModelConfigById({ id });

  if (!config) {
    throw new Error(`Model configuration not found for id=${id}`);
  }

  return config;
}

export type ModelSummary = {
  id: string;
  key: string;
  provider: string;
  providerModelId: string;
  name: string;
  description: string;
  supportsReasoning: boolean;
  reasoningTag: string | null;
  systemPrompt: string | null;
  codeTemplate: string | null;
  inputProviderCostPerMillion: number;
  outputProviderCostPerMillion: number;
  freeMessagesPerDay: number;
};

export function mapToModelSummary(config: ModelConfig): ModelSummary {
  return {
    id: config.id,
    key: config.key,
    provider: config.provider,
    providerModelId: config.providerModelId,
    name: config.displayName,
    description: config.description,
    supportsReasoning: config.supportsReasoning,
    reasoningTag: config.reasoningTag ?? null,
    systemPrompt: config.systemPrompt ?? null,
    codeTemplate: config.codeTemplate ?? null,
    inputProviderCostPerMillion: Number(
      config.inputProviderCostPerMillion ?? 0
    ),
    outputProviderCostPerMillion: Number(
      config.outputProviderCostPerMillion ?? 0
    ),
    freeMessagesPerDay: Number(config.freeMessagesPerDay ?? 3),
  };
}
