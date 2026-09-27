export const DEFAULT_TOOL_INTENT_MODEL_KEY = "gemini-flash-lite-latest";

export function selectToolIntentModelConfig<
  T extends { key: string; providerModelId: string; supportsReasoning: boolean },
>({
  configs,
  defaultConfig,
  preferredKey = DEFAULT_TOOL_INTENT_MODEL_KEY,
}: {
  configs: T[];
  defaultConfig: T | null;
  preferredKey?: string;
}): T | null {
  return (
    configs.find(
      (config) =>
        config.key === preferredKey || config.providerModelId === preferredKey
    ) ??
    (defaultConfig?.supportsReasoning
      ? configs.find((config) => !config.supportsReasoning)
      : defaultConfig) ??
    configs[0] ??
    null
  );
}
