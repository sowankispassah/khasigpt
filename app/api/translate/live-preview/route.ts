import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { safeAiErrorDiagnostics } from "@/lib/ai/error-diagnostics";
import { TRANSLATE_FEATURE_FLAG_KEY } from "@/lib/constants";
import {
  getLastKnownAppSetting,
  getTranslationFeatureLanguageByCodeRaw,
} from "@/lib/db/queries";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { loadFeatureAccessSettingsByKeys } from "@/lib/settings/feature-access-settings";
import { isFeatureEnabledForUser } from "@/lib/settings/user-feature-access";
import { parseTranslateAccessModeSetting } from "@/lib/translate/config";
import {
  buildLiveTranscriptAndTranslationPrompt,
  GEMINI_LIVE_TRANSLATION_MODEL_ID,
} from "@/lib/translate/live";
import { withTimeout } from "@/lib/utils/async";

// About 15 seconds of 16 kHz 16-bit mono PCM once base64 encoded. No web or
// native client calls this route today, so nothing larger is expected.
const LIVE_PREVIEW_MAX_AUDIO_BASE64_LENGTH = 640_000;
// A preview is one short transcript and translation in a small JSON object.
const LIVE_PREVIEW_MAX_OUTPUT_TOKENS = 512;
// Limits are keyed by user only, so rotating networks cannot multiply them.
const LIVE_PREVIEW_RATE_LIMIT = {
  limit: 10,
  windowMs: 60 * 1000,
};
const LIVE_PREVIEW_DAILY_RATE_LIMIT = {
  limit: 200,
  windowMs: 24 * 60 * 60 * 1000,
};

const bodySchema = z.object({
  audioBase64: z
    .string()
    .trim()
    .min(1)
    .max(LIVE_PREVIEW_MAX_AUDIO_BASE64_LENGTH),
  mimeType: z
    .string()
    .trim()
    .min(3)
    .max(128)
    .regex(/^audio\//i),
  targetLanguageCode: z.string().trim().min(2).max(16),
});

const TRANSLATE_SETTING_TIMEOUT_MS = 5_000;
const LIVE_PREVIEW_TIMEOUT_MS = 20_000;

export const runtime = "nodejs";

function parsePreviewResponse(text: string) {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return {
      transcript: "",
      translation: "",
    };
  }

  try {
    const parsed = JSON.parse(trimmedText) as {
      transcript?: unknown;
      translation?: unknown;
    };

    return {
      transcript:
        typeof parsed.transcript === "string" ? parsed.transcript.trim() : "",
      translation:
        typeof parsed.translation === "string" ? parsed.translation.trim() : "",
    };
  } catch {
    return {
      transcript: "",
      translation: "",
    };
  }
}

async function enforceLivePreviewRateLimit(userId: string) {
  const [shortTerm, daily] = await Promise.all([
    incrementRateLimit(
      `translate-live-preview:${userId}`,
      LIVE_PREVIEW_RATE_LIMIT
    ),
    incrementRateLimit(
      `translate-live-preview:daily:${userId}`,
      LIVE_PREVIEW_DAILY_RATE_LIMIT
    ),
  ]);

  if (shortTerm.allowed && daily.allowed) {
    return null;
  }

  const { resetAt } = daily.allowed ? shortTerm : daily;

  return Response.json(
    {
      message: daily.allowed
        ? "Too many live translation previews. Please try again shortly."
        : "You have reached today's live preview limit. Please try again later.",
    },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": Math.max(
          Math.ceil((resetAt - Date.now()) / 1000),
          1
        ).toString(),
      },
    }
  );
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await enforceLivePreviewRateLimit(session.user.id);
  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(body);

  if (!parsedBody.success) {
    return Response.json(
      { message: "A valid audio payload is required." },
      { status: 400 }
    );
  }

  const translateAccessSettings = await loadFeatureAccessSettingsByKeys(
    [TRANSLATE_FEATURE_FLAG_KEY],
    {
      source: "api.translate.live-preview.feature-access",
      timeoutMs: TRANSLATE_SETTING_TIMEOUT_MS,
    }
  );

  const rawTranslateSetting =
    translateAccessSettings.values.get(TRANSLATE_FEATURE_FLAG_KEY) ??
    getLastKnownAppSetting<string | boolean | number>(TRANSLATE_FEATURE_FLAG_KEY);
  const translateMode = parseTranslateAccessModeSetting(rawTranslateSetting);
  const translateSettingsUnavailable =
    translateAccessSettings.status === "unavailable" && rawTranslateSetting == null;

  // Fail closed: an unreadable setting must never open a paid feature.
  if (translateSettingsUnavailable) {
    return Response.json(
      { message: "Live preview is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const translateEnabled = await isFeatureEnabledForUser({
    featureKey: TRANSLATE_FEATURE_FLAG_KEY,
    mode: translateMode,
    role: session.user.role,
    source: "api.translate.live-preview.user-feature-access",
    userId: session.user.id,
  });

  if (!translateEnabled) {
    return Response.json({ message: "Not found" }, { status: 404 });
  }

  const targetLanguage = await withTimeout(
    getTranslationFeatureLanguageByCodeRaw(
      parsedBody.data.targetLanguageCode.toLowerCase()
    ),
    LIVE_PREVIEW_TIMEOUT_MS
  ).catch((error) => {
    console.error("[api/translate/live-preview] Failed to load language.", error);
    return null;
  });

  if (!targetLanguage || !targetLanguage.isActive) {
    return Response.json(
      { message: "Target language is unavailable." },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) {
    console.error("[api/translate/live-preview] Google API key is not configured.");
    return Response.json(
      { message: "Live preview is unavailable." },
      { status: 500 }
    );
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      apiVersion: "v1alpha",
    });

    const response = await withTimeout(
      ai.models.generateContent({
        model: GEMINI_LIVE_TRANSLATION_MODEL_ID,
        config: {
          maxOutputTokens: LIVE_PREVIEW_MAX_OUTPUT_TOKENS,
          responseMimeType: "application/json",
          systemInstruction: buildLiveTranscriptAndTranslationPrompt({
            languageName: targetLanguage.name,
            languageCode: targetLanguage.code,
            languageSystemPrompt: targetLanguage.systemPrompt ?? null,
          }),
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  data: parsedBody.data.audioBase64,
                  mimeType: parsedBody.data.mimeType,
                },
              },
            ],
          },
        ],
      }),
      LIVE_PREVIEW_TIMEOUT_MS
    );

    return Response.json(parsePreviewResponse(response.text ?? ""), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(
      "[api/translate/live-preview] Preview generation failed.",
      safeAiErrorDiagnostics(error)
    );

    return Response.json(
      {
        message: "Live preview failed.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
