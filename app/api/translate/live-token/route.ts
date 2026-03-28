import {
  ActivityHandling,
  EndSensitivity,
  GoogleGenAI,
  Modality,
  StartSensitivity,
  TurnCoverage,
} from "@google/genai";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { TRANSLATE_FEATURE_FLAG_KEY } from "@/lib/constants";
import {
  getAppSetting,
  getLastKnownAppSetting,
  getModelConfigById,
  getTranslationFeatureLanguageByCodeRaw,
} from "@/lib/db/queries";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import { isGoogleLiveTranslationModel } from "@/lib/translate/ai-service";
import { parseTranslateAccessModeSetting } from "@/lib/translate/config";
import {
  buildLiveTranslationSystemPrompt,
  LIVE_TOKEN_NEW_SESSION_WINDOW_MS,
  LIVE_TOKEN_SESSION_WINDOW_MS,
  type LiveTokenFallbackReason,
  type LiveTranslationTokenResponse,
} from "@/lib/translate/live";
import { withTimeout } from "@/lib/utils/async";

const bodySchema = z.object({
  targetLanguageCode: z.string().trim().min(2).max(16),
});

const TRANSLATE_SETTING_TIMEOUT_MS = 5_000;
const LIVE_TOKEN_TIMEOUT_MS = 10_000;
const LIVE_MODEL_TIMEOUT_MS = 7_000;

export const runtime = "nodejs";

function buildFallbackResponse(
  reason: LiveTokenFallbackReason,
  message: string
) {
  const payload: LiveTranslationTokenResponse = {
    liveSupported: false,
    reason,
    message,
  };

  return Response.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(body);

  if (!parsedBody.success) {
    return Response.json(
      { message: "A valid target language is required." },
      { status: 400 }
    );
  }

  const rawTranslateSetting = await withTimeout(
    getAppSetting<string | boolean | number>(TRANSLATE_FEATURE_FLAG_KEY),
    TRANSLATE_SETTING_TIMEOUT_MS
  ).catch(() =>
    getLastKnownAppSetting<string | boolean | number>(TRANSLATE_FEATURE_FLAG_KEY)
  );

  const translateMode = parseTranslateAccessModeSetting(rawTranslateSetting);
  const translateEnabled = isFeatureEnabledForRole(
    translateMode,
    session.user.role
  );

  if (!translateEnabled) {
    return Response.json({ message: "Not found" }, { status: 404 });
  }

  const targetLanguageCode = parsedBody.data.targetLanguageCode.toLowerCase();
  const targetLanguage = await withTimeout(
    getTranslationFeatureLanguageByCodeRaw(targetLanguageCode),
    LIVE_TOKEN_TIMEOUT_MS
  );

  if (
    !targetLanguage ||
    !targetLanguage.isActive
  ) {
    return Response.json(
      { message: "Target language is unavailable for live translation." },
      { status: 400 }
    );
  }

  if (!targetLanguage.speechModelConfigId) {
    return buildFallbackResponse(
      "speech-model-missing",
      "No live speech model is configured for this language."
    );
  }

  const speechModelConfig = await withTimeout(
    getModelConfigById({ id: targetLanguage.speechModelConfigId }),
    LIVE_MODEL_TIMEOUT_MS
  );

  if (!speechModelConfig || !speechModelConfig.isEnabled) {
    return buildFallbackResponse(
      "speech-model-disabled",
      "The configured live speech model is unavailable."
    );
  }

  if (!isGoogleLiveTranslationModel(speechModelConfig)) {
    return buildFallbackResponse(
      "speech-model-unsupported",
      "The configured speech model does not support Gemini Live audio sessions."
    );
  }

  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) {
    return buildFallbackResponse(
      "live-api-unavailable",
      "Live translation is unavailable because the Google API key is not configured."
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    apiVersion: "v1alpha",
  });

  const now = Date.now();
  const newSessionExpireTime = new Date(
    now + LIVE_TOKEN_NEW_SESSION_WINDOW_MS
  ).toISOString();
  const expireTime = new Date(now + LIVE_TOKEN_SESSION_WINDOW_MS).toISOString();
  const token = await withTimeout(
    ai.authTokens.create({
      config: {
        uses: 1,
        newSessionExpireTime,
        expireTime,
        liveConnectConstraints: {
          model: speechModelConfig.providerModelId,
          config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            sessionResumption: {
              transparent: true,
            },
            realtimeInputConfig: {
              activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
              automaticActivityDetection: {
                endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
                prefixPaddingMs: 100,
                silenceDurationMs: 400,
                startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
              },
              turnCoverage: TurnCoverage.TURN_INCLUDES_ONLY_ACTIVITY,
            },
            systemInstruction: buildLiveTranslationSystemPrompt({
              languageName: targetLanguage.name,
              languageCode: targetLanguage.code,
              languageSystemPrompt: targetLanguage.systemPrompt ?? null,
            }),
          },
        },
      },
    }),
    LIVE_TOKEN_TIMEOUT_MS
  ).catch((error) => {
    console.error("[api/translate/live-token] Failed to create auth token.", error);
    throw error;
  });

  if (!token.name?.trim()) {
    return Response.json(
      { message: "Live translation token could not be created." },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const payload: LiveTranslationTokenResponse = {
    liveSupported: true,
    token: token.name,
    modelDisplayName: speechModelConfig.displayName,
    modelProviderModelId: speechModelConfig.providerModelId,
    expireTime,
    newSessionExpireTime,
  };

  return Response.json(
    payload,
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
