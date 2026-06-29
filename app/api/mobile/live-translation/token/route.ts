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
import { getAppSetting, getLastKnownAppSetting } from "@/lib/db/queries";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import {
  buildLiveTranslationSystemInstruction,
  DEFAULT_LIVE_TRANSLATION_LANGUAGE_A,
  DEFAULT_LIVE_TRANSLATION_LANGUAGE_B,
  DEFAULT_LIVE_TRANSLATION_SYSTEM_INSTRUCTION,
  getLiveTranslationAccessModeForPlatform,
  getLiveTranslationLanguageName,
  LIVE_TRANSLATION_ACCESS_MODE_FALLBACK,
  LIVE_TRANSLATION_DEFAULT_LANGUAGE_A_SETTING_KEY,
  LIVE_TRANSLATION_DEFAULT_LANGUAGE_B_SETTING_KEY,
  LIVE_TRANSLATION_SUPPORTED_LANGUAGES_SETTING_KEY,
  LIVE_TRANSLATION_SYSTEM_INSTRUCTION_SETTING_KEY,
  normalizeLiveTranslationLanguages,
  resolveLiveTranslationLanguageCode,
} from "@/lib/live-translation/config";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";
import { withTimeout } from "@/lib/utils/async";
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

const LIVE_TRANSLATION_TOKEN_TIMEOUT_MS = 10_000;
const LIVE_TRANSLATION_SETTING_TIMEOUT_MS = 5_000;
const LIVE_TRANSLATION_TOKEN_RATE_LIMIT = {
  limit: 20,
  windowMs: 5 * 60 * 1000,
};

const liveTranslationTokenSchema = z.object({
  languageACode: z.string().trim().min(2).max(16),
  languageBCode: z.string().trim().min(2).max(16),
  modelId: z.string().uuid().optional(),
});

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

async function enforceLiveTranslationTokenRateLimit(
  request: Request,
  userId: string
) {
  const clientKey = getClientKeyFromHeaders(request.headers);
  const { allowed, resetAt } = await incrementRateLimit(
    `live-translation-token:mobile:${userId}:${clientKey}`,
    LIVE_TRANSLATION_TOKEN_RATE_LIMIT
  );

  if (allowed) {
    return null;
  }

  return Response.json(
    { message: "Too many live translation sessions. Please try again shortly." },
    {
      headers: {
        ...noStoreHeaders(),
        "Retry-After": Math.max(
          Math.ceil((resetAt - Date.now()) / 1000),
          1
        ).toString(),
      },
      status: 429,
    }
  );
}

async function loadLiveTranslationSettings() {
  const [languagesValue, defaultLanguageA, defaultLanguageB, instruction] =
    await Promise.all([
      withTimeout(
        getAppSetting<unknown>(LIVE_TRANSLATION_SUPPORTED_LANGUAGES_SETTING_KEY),
        LIVE_TRANSLATION_SETTING_TIMEOUT_MS
      ).catch((error) => {
        console.error(
          "[api/mobile/live-translation/token] Supported languages read failed.",
          error
        );
        return getLastKnownAppSetting<unknown>(
          LIVE_TRANSLATION_SUPPORTED_LANGUAGES_SETTING_KEY
        );
      }),
      withTimeout(
        getAppSetting<string>(LIVE_TRANSLATION_DEFAULT_LANGUAGE_A_SETTING_KEY),
        LIVE_TRANSLATION_SETTING_TIMEOUT_MS
      ).catch((error) => {
        console.error(
          "[api/mobile/live-translation/token] Default language A read failed.",
          error
        );
        return getLastKnownAppSetting<string>(
          LIVE_TRANSLATION_DEFAULT_LANGUAGE_A_SETTING_KEY
        );
      }),
      withTimeout(
        getAppSetting<string>(LIVE_TRANSLATION_DEFAULT_LANGUAGE_B_SETTING_KEY),
        LIVE_TRANSLATION_SETTING_TIMEOUT_MS
      ).catch((error) => {
        console.error(
          "[api/mobile/live-translation/token] Default language B read failed.",
          error
        );
        return getLastKnownAppSetting<string>(
          LIVE_TRANSLATION_DEFAULT_LANGUAGE_B_SETTING_KEY
        );
      }),
      withTimeout(
        getAppSetting<string>(LIVE_TRANSLATION_SYSTEM_INSTRUCTION_SETTING_KEY),
        LIVE_TRANSLATION_SETTING_TIMEOUT_MS
      ).catch((error) => {
        console.error(
          "[api/mobile/live-translation/token] System instruction read failed.",
          error
        );
        return getLastKnownAppSetting<string>(
          LIVE_TRANSLATION_SYSTEM_INSTRUCTION_SETTING_KEY
        );
      }),
    ]);
  const languages = normalizeLiveTranslationLanguages(languagesValue);
  return {
    defaultLanguageA: resolveLiveTranslationLanguageCode({
      fallback: DEFAULT_LIVE_TRANSLATION_LANGUAGE_A,
      languages,
      value: defaultLanguageA,
    }),
    defaultLanguageB: resolveLiveTranslationLanguageCode({
      fallback: DEFAULT_LIVE_TRANSLATION_LANGUAGE_B,
      languages,
      value: defaultLanguageB,
    }),
    languages,
    systemInstruction:
      typeof instruction === "string" && instruction.trim()
        ? instruction.trim()
        : DEFAULT_LIVE_TRANSLATION_SYSTEM_INSTRUCTION,
  };
}

export async function POST(request: Request) {
  const authContext = await getAuthenticatedUser(request, {
    allowCookie: false,
  });

  if (!authContext?.user) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await enforceLiveTranslationTokenRateLimit(
    request,
    authContext.user.id
  );
  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => undefined);
  const parsedBody = liveTranslationTokenSchema.safeParse(body);
  if (!parsedBody.success) {
    return fallbackResponse(
      "platform-unavailable",
      "A valid live translation request is required.",
      400
    );
  }

  const [accessMode, liveVoiceModel, settings] = await Promise.all([
    withApiTiming(
      "mobile.live-translation-token.settings",
      () => getLiveTranslationAccessModeForPlatform("android"),
      { slowMs: 750 }
    ).catch((error) => {
      console.error(
        "[api/mobile/live-translation/token] Feature setting read failed.",
        error
      );
      return LIVE_TRANSLATION_ACCESS_MODE_FALLBACK;
    }),
    withApiTiming(
      "mobile.live-translation-token.model",
      () =>
        resolveLiveVoiceModelConfig({
          modelId: parsedBody.data.modelId,
          platform: "native",
        }),
      { slowMs: 750 }
    ).catch((error) => {
      console.error(
        "[api/mobile/live-translation/token] Model config read failed.",
        error
      );
      return null;
    }),
    loadLiveTranslationSettings(),
  ]);

  if (!isFeatureEnabledForRole(accessMode, authContext.user.role)) {
    return fallbackResponse(
      "feature-disabled",
      "Live Translation is not enabled for this account.",
      404
    );
  }

  if (!liveVoiceModel) {
    return fallbackResponse(
      "feature-disabled",
      "Live Translation is not enabled for this platform.",
      404
    );
  }

  const languageACode = resolveLiveTranslationLanguageCode({
    fallback: settings.defaultLanguageA,
    languages: settings.languages,
    value: parsedBody.data.languageACode,
  });
  const languageBCode = resolveLiveTranslationLanguageCode({
    fallback: settings.defaultLanguageB,
    languages: settings.languages,
    value: parsedBody.data.languageBCode,
  });
  if (languageACode === languageBCode) {
    return fallbackResponse(
      "platform-unavailable",
      "Choose two different languages for Live Translation.",
      400
    );
  }

  const hasCredits = await withApiTiming(
    "mobile.live-translation-token.credits",
    () =>
      hasEnoughCreditsForLiveVoice({
        tokensPerVoiceInteraction: liveVoiceModel.tokensPerVoiceInteraction,
        userId: authContext.user.id,
      }),
    { slowMs: 750 }
  ).catch((error) => {
    console.error(
      "[api/mobile/live-translation/token] Credit read failed.",
      error
    );
    return false;
  });

  if (!hasCredits) {
    return fallbackResponse(
      "insufficient-credits",
      "You do not have enough credits to start Live Translation.",
      402
    );
  }

  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) {
    return fallbackResponse(
      "live-api-unavailable",
      "Live Translation is unavailable because the Google API key is not configured.",
      500
    );
  }

  const languageA = {
    code: languageACode,
    name: getLiveTranslationLanguageName({
      code: languageACode,
      languages: settings.languages,
    }),
  };
  const languageB = {
    code: languageBCode,
    name: getLiveTranslationLanguageName({
      code: languageBCode,
      languages: settings.languages,
    }),
  };
  const systemInstruction = buildLiveTranslationSystemInstruction({
    languageA,
    languageB,
    systemInstruction: settings.systemInstruction,
  });

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
    "mobile.live-translation-token.google-token",
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
                systemInstruction,
              },
            },
          },
        }),
        LIVE_TRANSLATION_TOKEN_TIMEOUT_MS
      ),
    { slowMs: 1500 }
  ).catch((error) => {
    console.error(
      "[api/mobile/live-translation/token] Token creation failed.",
      error
    );
    return null;
  });

  if (!token?.name?.trim()) {
    return fallbackResponse(
      "live-api-unavailable",
      "Live Translation token could not be created. Please try again.",
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
      systemInstruction,
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
