export const GPT_LIVE_MODEL_ID = "gpt-live-1";
export const OPENAI_LIVE_VOICES = ["marin", "quartz", "ripple", "vesper", "willow", "stone", "gleam", "meridian", "bossa", "tempo", "beacon", "delta", "cinder"];

export type DurationVoicePricing = {
  providerCostPerMinuteUsd: number;
  customerChargePerMinuteUsd: number;
  backendModel: string;
  backendInputCostPerMillionUsd: number;
  backendCachedInputCostPerMillionUsd: number;
  backendOutputCostPerMillionUsd: number;
};

export const DEFAULT_DURATION_VOICE_PRICING: DurationVoicePricing = {
  providerCostPerMinuteUsd: 0.05,
  customerChargePerMinuteUsd: 0.15,
  backendModel: "gpt-5.6-luna",
  backendInputCostPerMillionUsd: 0.2,
  backendCachedInputCostPerMillionUsd: 0.02,
  backendOutputCostPerMillionUsd: 1.2,
};

export function isDurationVoiceModel(model: { provider: string; providerModelId: string }) {
  return model.provider === "openai" && model.providerModelId === GPT_LIVE_MODEL_ID;
}

export function readDurationVoicePricing(config: unknown): DurationVoicePricing | null {
  if (!config || typeof config !== "object") return null;
  const row = (config as Record<string, unknown>).durationPricing;
  if (!row || typeof row !== "object") return null;
  const p = row as DurationVoicePricing;
  const costs = [p.providerCostPerMinuteUsd, p.customerChargePerMinuteUsd, p.backendInputCostPerMillionUsd, p.backendCachedInputCostPerMillionUsd, p.backendOutputCostPerMillionUsd];
  if (costs.some(value => typeof value !== "number" || !Number.isFinite(value) || value <= 0)) return null;
  const markup = p.customerChargePerMinuteUsd / p.providerCostPerMinuteUsd;
  if (markup < 1 || markup > 20 || typeof p.backendModel !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,127}$/.test(p.backendModel)) return null;
  return p;
}

export function hasLiveVoicePricing(model: { provider: string; providerModelId: string; config: unknown; inputProviderCostPerMillion: unknown; outputProviderCostPerMillion: unknown }) {
  return isDurationVoiceModel(model)
    ? readDurationVoicePricing(model.config) !== null
    : model.provider === "google" && [model.inputProviderCostPerMillion, model.outputProviderCostPerMillion].every(value => typeof value === "number" && Number.isFinite(value) && value > 0);
}

// Provider duration updates are cumulative snapshots, not individual charges.
export function unbilledVoiceSeconds(reported: unknown, billed: number) {
  return typeof reported === "number" && Number.isFinite(reported) && reported >= 0
    ? Math.max(0, reported - billed) : 0;
}
