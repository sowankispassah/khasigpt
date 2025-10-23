import "server-only";

import { cache } from "react";

import {
  createModelConfig,
  getModelConfigById,
  listModelConfigs,
  setDefaultModelConfig,
} from "@/lib/db/queries";
import type { ModelConfig } from "@/lib/db/schema";

const SEED_MODEL_KEY = "openai-gpt-4o-mini";

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
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
  });

  await setDefaultModelConfig(created.id);

  return await listModelConfigs();
}

export const getModelRegistry = cache(async () => {
  const configs = await ensureModelConfigs();
  const defaultConfig =
    configs.find((config) => config.isDefault) ?? configs[0] ?? null;

  return {
    configs,
    defaultConfig,
  };
});

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
  inputCostPerMillion: number;
  outputCostPerMillion: number;
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
    inputCostPerMillion: Number(config.inputCostPerMillion ?? 0),
    outputCostPerMillion: Number(config.outputCostPerMillion ?? 0),
  };
}
