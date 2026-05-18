import {
  ActivityHandling,
  EndSensitivity,
  GoogleGenAI,
  Modality,
  StartSensitivity,
  TurnCoverage,
} from "@google/genai";
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
  buildVoiceChatSystemInstruction,
  GEMINI_LIVE_WS_URL,
  GEMINI_VOICE_CHAT_MODEL_ID,
  GEMINI_VOICE_CHAT_MODEL_NAME,
  type GeminiVoiceTokenResponse,
  VOICE_INPUT_AUDIO_MIME_TYPE,
  VOICE_INPUT_AUDIO_SAMPLE_RATE,
  VOICE_OUTPUT_AUDIO_SAMPLE_RATE,
  VOICE_TOKEN_NEW_SESSION_WINDOW_MS,
  VOICE_TOKEN_SESSION_WINDOW_MS,
} from "@/lib/voice/live";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VOICE_SETTING_TIMEOUT_MS = 5_000;
const VOICE_TOKEN_TIMEOUT_MS = 10_000;

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
          model: GEMINI_VOICE_CHAT_MODEL_ID,
          config: {
            responseModalities: [Modality.AUDIO],
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
            systemInstruction: buildVoiceChatSystemInstruction(),
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
      modelDisplayName: GEMINI_VOICE_CHAT_MODEL_NAME,
      modelProviderModelId: GEMINI_VOICE_CHAT_MODEL_ID,
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
