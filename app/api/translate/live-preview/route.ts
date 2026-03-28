import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { TRANSLATE_FEATURE_FLAG_KEY } from "@/lib/constants";
import {
  getAppSetting,
  getLastKnownAppSetting,
  getTranslationFeatureLanguageByCodeRaw,
} from "@/lib/db/queries";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import { parseTranslateAccessModeSetting } from "@/lib/translate/config";
import {
  buildLiveTranscriptAndTranslationPrompt,
  GEMINI_LIVE_TRANSLATION_MODEL_ID,
} from "@/lib/translate/live";
import { withTimeout } from "@/lib/utils/async";

const bodySchema = z.object({
  audioBase64: z.string().trim().min(1).max(2_500_000),
  mimeType: z.string().trim().min(3).max(128),
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

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(body);

  if (!parsedBody.success) {
    return Response.json(
      { message: "A valid audio payload is required." },
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

  const targetLanguage = await withTimeout(
    getTranslationFeatureLanguageByCodeRaw(
      parsedBody.data.targetLanguageCode.toLowerCase()
    ),
    LIVE_PREVIEW_TIMEOUT_MS
  );

  if (!targetLanguage || !targetLanguage.isActive) {
    return Response.json(
      { message: "Target language is unavailable." },
      { status: 400 }
    );
  }

  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      { message: "GOOGLE_API_KEY is not configured." },
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
    console.error("[api/translate/live-preview] Preview generation failed.", error);

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
