import "server-only";

import { buildKhasiGptSystemInstruction } from "@/lib/ai/identity";
import { hasCompleteTokenProviderPricing } from "@/lib/billing/cost-plus";
import {
  getDefaultLiveVoiceModelConfig,
  getLiveVoiceModelConfigById,
  getUserBalanceSummary,
} from "@/lib/db/queries";
import type { LiveVoiceModelConfig } from "@/lib/db/schema";
import { buildVoiceChatSystemInstruction } from "@/lib/voice/live";

export type LiveVoicePlatform = "native" | "web";

export type ResolvedLiveVoiceModelConfig = {
  id: string | null;
  provider: LiveVoiceModelConfig["provider"];
  providerModelId: string;
  displayName: string;
  description: string;
  systemInstruction: string;
  voiceName: string;
  mediaResolution: string;
};

function toResolvedLiveVoiceModelConfig(
  config: LiveVoiceModelConfig
): ResolvedLiveVoiceModelConfig {
  const systemInstruction = config.systemInstruction?.trim()
    ? buildKhasiGptSystemInstruction(config.systemInstruction)
    : buildVoiceChatSystemInstruction();

  return {
    id: config.id,
    provider: config.provider,
    providerModelId: config.providerModelId,
    displayName: config.displayName,
    description: config.description ?? "",
    systemInstruction,
    voiceName: config.voiceName?.trim() || "Zephyr",
    mediaResolution: config.mediaResolution?.trim() || "MEDIA_RESOLUTION_MEDIUM",
  };
}

export async function resolveLiveVoiceModelConfig({
  modelId,
  platform,
}: {
  modelId?: string | null;
  platform: LiveVoicePlatform;
}): Promise<ResolvedLiveVoiceModelConfig | null> {
  const candidate = modelId
    ? await getLiveVoiceModelConfigById({ id: modelId })
    : await getDefaultLiveVoiceModelConfig({ platform });

  if (!candidate) {
    return null;
  }

  if (!candidate.isEnabled || candidate.deletedAt) {
    return null;
  }
  if (platform === "web" && !candidate.enabledOnWeb) {
    return null;
  }
  if (platform === "native" && !candidate.enabledOnNative) {
    return null;
  }
  if (!hasCompleteTokenProviderPricing({
    inputCostPerMillionUsd: candidate.inputProviderCostPerMillion,
    outputCostPerMillionUsd: candidate.outputProviderCostPerMillion,
  })) {
    console.error("[live-voice] Configured model is missing provider pricing.", {
      modelConfigId: candidate.id,
    });
    return null;
  }

  return toResolvedLiveVoiceModelConfig(candidate);
}

export async function hasEnoughCreditsForLiveVoice({
  userId,
}: {
  userId: string;
}) {
  const balance = await getUserBalanceSummary(userId);
  return balance.tokensRemaining > 0;
}
