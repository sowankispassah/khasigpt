import "server-only";

import { cache } from "react";

import {
  getModelRegistry,
  mapToModelSummary,
  type ModelSummary,
} from "./model-registry";

export type ChatModel = ModelSummary;

export const loadChatModels = cache(async () => {
  const { configs, defaultConfig } = await getModelRegistry();

  const models = configs.map(mapToModelSummary);
  const defaultModel = defaultConfig ? mapToModelSummary(defaultConfig) : null;

  return {
    models,
    defaultModel,
  };
});
