import "server-only";

import {
  getDefaultLiveVoiceModelConfig,
  getLiveVoiceModelConfigById,
  getUserBalanceSummary,
  hasLiveVoiceModelConfigTable,
} from "@/lib/db/queries";
import type { LiveVoiceModelConfig } from "@/lib/db/schema";
import {
  buildVoiceChatSystemInstruction,
  calculateLiveVoiceTokensPerInteraction,
  GEMINI_VOICE_CHAT_MODEL_ID,
  GEMINI_VOICE_CHAT_MODEL_NAME,
  normalizeLiveVoiceCreditMultiplier,
} from "@/lib/voice/live";

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
  creditMultiplier: number;
  tokensPerVoiceInteraction: number;
};

export function defaultLiveVoiceModelConfig(): ResolvedLiveVoiceModelConfig {
  const creditMultiplier = 3;
  return {
    id: null,
    provider: "google",
    providerModelId: GEMINI_VOICE_CHAT_MODEL_ID,
    displayName: GEMINI_VOICE_CHAT_MODEL_NAME,
    description: "Realtime Gemini Live voice model for spoken chat.",
    systemInstruction: buildVoiceChatSystemInstruction(),
    voiceName: "Zephyr",
    mediaResolution: "MEDIA_RESOLUTION_MEDIUM",
    creditMultiplier,
    tokensPerVoiceInteraction:
      calculateLiveVoiceTokensPerInteraction(creditMultiplier),
  };
}

function toResolvedLiveVoiceModelConfig(
  config: LiveVoiceModelConfig
): ResolvedLiveVoiceModelConfig {
  const creditMultiplier = normalizeLiveVoiceCreditMultiplier(
    config.creditMultiplier
  );
  const systemInstruction = config.systemInstruction?.trim()
    ? config.systemInstruction.trim()
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
    creditMultiplier,
    tokensPerVoiceInteraction:
      calculateLiveVoiceTokensPerInteraction(creditMultiplier),
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
    return (await hasLiveVoiceModelConfigTable())
      ? null
      : defaultLiveVoiceModelConfig();
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

  return toResolvedLiveVoiceModelConfig(candidate);
}

export async function hasEnoughCreditsForLiveVoice({
  tokensPerVoiceInteraction,
  userId,
}: {
  tokensPerVoiceInteraction: number;
  userId: string;
}) {
  const balance = await getUserBalanceSummary(userId);
  return balance.tokensRemaining >= tokensPerVoiceInteraction;
}
