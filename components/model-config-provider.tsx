"use client";

import {
  createContext,
  useContext,
  type ReactNode,
  useMemo,
} from "react";

type ModelSummary = {
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
};

type ModelConfigContextValue = {
  models: ModelSummary[];
  defaultModelId: string | null;
};

const ModelConfigContext = createContext<ModelConfigContextValue>({
  models: [],
  defaultModelId: null,
});

export function ModelConfigProvider({
  models,
  defaultModelId,
  children,
}: {
  models: ModelSummary[];
  defaultModelId: string | null;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      models,
      defaultModelId,
    }),
    [models, defaultModelId]
  );

  return (
    <ModelConfigContext.Provider value={value}>
      {children}
    </ModelConfigContext.Provider>
  );
}

export function useModelConfig() {
  return useContext(ModelConfigContext);
}

export type { ModelSummary };
