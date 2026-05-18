import {
  ActivityHandling,
  EndSensitivity,
  GoogleGenAI,
  type MediaResolution,
  Modality,
  StartSensitivity,
  TurnCoverage,
} from "@google/genai";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import {
  VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY,
  VOICE_CHAT_WEB_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import { getLiteAppSettingsByKeysUncached } from "@/lib/db/app-settings-lite";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import { withTimeout } from "@/lib/utils/async";
import {
  parseVoiceChatAccessModeSetting,
  resolvePlatformVoiceChatSetting,
} from "@/lib/voice/config";
import {
  GEMINI_LIVE_WS_URL,
  type GeminiVoiceTokenResponse,
  VOICE_INPUT_AUDIO_MIME_TYPE,
  VOICE_INPUT_AUDIO_SAMPLE_RATE,
  VOICE_OUTPUT_AUDIO_SAMPLE_RATE,
  VOICE_TOKEN_NEW_SESSION_WINDOW_MS,
  VOICE_TOKEN_SESSION_WINDOW_MS,
} from "@/lib/voice/live";
import {
  hasEnoughCreditsForLiveVoice,
  resolveLiveVoiceModelConfig,
} from "@/lib/voice/live-models";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VOICE_SETTING_TIMEOUT_MS = 5_000;
const VOICE_TOKEN_TIMEOUT_MS = 10_000;

const voiceTokenSchema = z
  .object({
    modelId: z.string().uuid().optional(),
  })
  .optional();

function fallbackResponse(
  reason: Extract<GeminiVoiceTokenResponse, { liveSupported: false }>["reason"],
  message: string,
  status = 200
) {
  return Response.json(
    {
      liveSupported: false,
      message,
      reason,
    } satisfies GeminiVoiceTokenResponse,
    { headers: noStoreHeaders(), status }
  );
}

export async function POST(request: Request) {
  const authContext = await getAuthenticatedUser(request, {
    allowBearer: false,
  });

  if (!authContext?.user) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => undefined);
  const parsedBody = voiceTokenSchema.safeParse(body);
  if (!parsedBody.success) {
    return fallbackResponse(
      "platform-unavailable",
      "A valid live voice model request is required.",
      400
    );
  }

  const voiceSettingRows = await withTimeout(
    getLiteAppSettingsByKeysUncached([
      VOICE_CHAT_WEB_FEATURE_FLAG_KEY,
      VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY,
    ]),
    VOICE_SETTING_TIMEOUT_MS
  ).catch((error) => {
    console.error("[api/chat/voice-token] Feature setting read failed.", error);
    return null;
  });

  if (!voiceSettingRows) {
    return fallbackResponse(
      "feature-disabled",
      "Voice chat settings could not be confirmed. Please try again.",
      503
    );
  }

  const voiceSettings = new Map(
    voiceSettingRows.map((row) => [row.key, row.value])
  );

  const voiceMode = parseVoiceChatAccessModeSetting(
    resolvePlatformVoiceChatSetting({
      legacyValue: voiceSettings.get(VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY),
      webValue: voiceSettings.get(VOICE_CHAT_WEB_FEATURE_FLAG_KEY),
    }).web
  );
  if (!isFeatureEnabledForRole(voiceMode, authContext.user.role)) {
    return fallbackResponse(
      "feature-disabled",
      "Voice chat is not enabled for this account.",
      404
    );
  }

  const liveVoiceModel = await resolveLiveVoiceModelConfig({
    modelId: parsedBody.data?.modelId,
    platform: "web",
  });
  if (!liveVoiceModel) {
    return fallbackResponse(
      "feature-disabled",
      "Voice chat is not enabled for this platform.",
      404
    );
  }

  const hasCredits = await hasEnoughCreditsForLiveVoice({
    tokensPerVoiceInteraction: liveVoiceModel.tokensPerVoiceInteraction,
    userId: authContext.user.id,
  }).catch((error) => {
    console.error("[api/chat/voice-token] Credit read failed.", error);
    return false;
  });

  if (!hasCredits) {
    return fallbackResponse(
      "insufficient-credits",
      "You do not have enough credits to start a live voice chat.",
      402
    );
  }

  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) {
    return fallbackResponse(
      "live-api-unavailable",
      "Voice chat is unavailable because the Google API key is not configured.",
      500
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    apiVersion: "v1alpha",
  });

  const now = Date.now();
  const newSessionExpireTime = new Date(
    now + VOICE_TOKEN_NEW_SESSION_WINDOW_MS
  ).toISOString();
  const expireTime = new Date(now + VOICE_TOKEN_SESSION_WINDOW_MS).toISOString();

  const token = await withTimeout(
    ai.authTokens.create({
      config: {
        uses: 1,
        newSessionExpireTime,
        expireTime,
        liveConnectConstraints: {
          model: liveVoiceModel.providerModelId,
          config: {
            responseModalities: [Modality.AUDIO],
            mediaResolution:
              liveVoiceModel.mediaResolution as unknown as MediaResolution,
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: liveVoiceModel.voiceName,
                },
              },
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            realtimeInputConfig: {
              activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
              automaticActivityDetection: {
                endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
                prefixPaddingMs: 120,
                silenceDurationMs: 500,
                startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
              },
              turnCoverage: TurnCoverage.TURN_INCLUDES_ONLY_ACTIVITY,
            },
            systemInstruction: liveVoiceModel.systemInstruction,
          },
        },
      },
    }),
    VOICE_TOKEN_TIMEOUT_MS
  ).catch((error) => {
    console.error("[api/chat/voice-token] Token creation failed.", error);
    throw error;
  });

  if (!token.name?.trim()) {
    return Response.json(
      { message: "Voice chat token could not be created." },
      { headers: noStoreHeaders(), status: 500 }
    );
  }

  return Response.json(
    {
      liveSupported: true,
      token: token.name,
      liveVoiceModelConfigId: liveVoiceModel.id,
      modelDisplayName: liveVoiceModel.displayName,
      modelProviderModelId: liveVoiceModel.providerModelId,
      voiceName: liveVoiceModel.voiceName,
      mediaResolution: liveVoiceModel.mediaResolution,
      systemInstruction: liveVoiceModel.systemInstruction,
      creditMultiplier: liveVoiceModel.creditMultiplier,
      tokensPerVoiceInteraction: liveVoiceModel.tokensPerVoiceInteraction,
      webSocketUrl: GEMINI_LIVE_WS_URL,
      inputAudioMimeType: VOICE_INPUT_AUDIO_MIME_TYPE,
      inputSampleRate: VOICE_INPUT_AUDIO_SAMPLE_RATE,
      outputSampleRate: VOICE_OUTPUT_AUDIO_SAMPLE_RATE,
      expireTime,
      newSessionExpireTime,
    } satisfies GeminiVoiceTokenResponse,
    { headers: noStoreHeaders() }
  );
}
