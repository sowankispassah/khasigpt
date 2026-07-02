"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";

type ModelSummary = {
  id: string;
  name: string;
  description: string;
  supportsReasoning: boolean;
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
