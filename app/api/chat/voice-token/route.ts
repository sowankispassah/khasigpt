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
import { withApiTiming } from "@/lib/api/observability";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import { withTimeout } from "@/lib/utils/async";
import { getVoiceChatAccessModeForPlatform } from "@/lib/voice/config";
import {
  GEMINI_LIVE_WS_URL,
  type GeminiVoiceTokenResponse,
  VOICE_ACTIVITY_PREFIX_PADDING_MS,
  VOICE_ACTIVITY_SILENCE_DURATION_MS,
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

  const voiceModePromise = withApiTiming(
    "web.voice-token.settings",
    () => getVoiceChatAccessModeForPlatform("web"),
    { slowMs: 750 }
  ).catch((error) => {
    console.error("[api/chat/voice-token] Feature setting read failed.", error);
    return "enabled" as const;
  });

  const liveVoiceModelPromise = withApiTiming(
    "web.voice-token.model",
    () =>
      resolveLiveVoiceModelConfig({
        modelId: parsedBody.data?.modelId,
        platform: "web",
      }),
    { slowMs: 750 }
  ).catch((error) => {
    console.error("[api/chat/voice-token] Model config read failed.", error);
    return null;
  });

  const [voiceMode, liveVoiceModel] = await Promise.all([
    voiceModePromise,
    liveVoiceModelPromise,
  ]);

  if (!isFeatureEnabledForRole(voiceMode, authContext.user.role)) {
    return fallbackResponse(
      "feature-disabled",
      "Voice chat is not enabled for this account.",
      404
    );
  }

  if (!liveVoiceModel) {
    return fallbackResponse(
      "feature-disabled",
      "Voice chat is not enabled for this platform.",
      404
    );
  }

  const hasCredits = await withApiTiming(
    "web.voice-token.credits",
    () =>
      hasEnoughCreditsForLiveVoice({
        tokensPerVoiceInteraction: liveVoiceModel.tokensPerVoiceInteraction,
        userId: authContext.user.id,
      }),
    { slowMs: 750 }
  ).catch((error) => {
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

  const token = await withApiTiming(
    "web.voice-token.google-token",
    () =>
      withTimeout(
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
                  activityHandling:
                    ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
                  automaticActivityDetection: {
                    endOfSpeechSensitivity:
                      EndSensitivity.END_SENSITIVITY_LOW,
                    prefixPaddingMs: VOICE_ACTIVITY_PREFIX_PADDING_MS,
                    silenceDurationMs: VOICE_ACTIVITY_SILENCE_DURATION_MS,
                    startOfSpeechSensitivity:
                      StartSensitivity.START_SENSITIVITY_HIGH,
                  },
                  turnCoverage: TurnCoverage.TURN_INCLUDES_ONLY_ACTIVITY,
                },
                systemInstruction: liveVoiceModel.systemInstruction,
              },
            },
          },
        }),
        VOICE_TOKEN_TIMEOUT_MS
      ),
    { slowMs: 1500 }
  ).catch((error) => {
    console.error("[api/chat/voice-token] Token creation failed.", error);
    return null;
  });

  if (!token?.name?.trim()) {
    return fallbackResponse(
      "live-api-unavailable",
      "Voice chat token could not be created. Please try again.",
      503
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
