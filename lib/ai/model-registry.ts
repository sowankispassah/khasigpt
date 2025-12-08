import "server-only";

import { unstable_cache } from "next/cache";

import {
  createModelConfig,
  getModelConfigById,
  listModelConfigs,
  setDefaultModelConfig,
} from "@/lib/db/queries";
import type { ModelConfig } from "@/lib/db/schema";

const SEED_MODEL_KEY = "openai-gpt-4o-mini";
export const MODEL_REGISTRY_CACHE_TAG = "model-registry";
const MODEL_REGISTRY_CACHE_KEY = "model-registry";

async function ensureModelConfigs(): Promise<ModelConfig[]> {
  const existing = await listModelConfigs();

  if (existing.length > 0) {
    return existing;
  }

  const created = await createModelConfig({
    key: SEED_MODEL_KEY,
    provider: "openai",
    providerModelId: "gpt-4o-mini",
    displayName: "GPT-4o mini",
    description:
      "OpenAI multimodal model suited for fast, general-purpose conversations.",
    systemPrompt:
      "You are a helpful AI assistant. Offer concise, accurate, and friendly responses.",
    codeTemplate: `const response = await openai.responses.create({
  model: "gpt-4o-mini",
  input: "Hello!",
});`,
    supportsReasoning: false,
    config: null,
    isEnabled: true,
    isDefault: true,
    freeMessagesPerDay: 3,
  });

  await setDefaultModelConfig(created.id);

  return await listModelConfigs();
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
  { tags: [MODEL_REGISTRY_CACHE_TAG] }
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
