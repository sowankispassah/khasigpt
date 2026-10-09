import { z } from "zod";
import { safeAiErrorDiagnostics } from "@/lib/ai/error-diagnostics";
import {
  TRANSLATE_FEATURE_FLAG_KEY,
  TRANSLATE_PROVIDER_MODE_SETTING_KEY,
} from "@/lib/constants";
import { getAppSetting, getLastKnownAppSetting } from "@/lib/db/queries";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { loadFeatureAccessSettingsByKeys } from "@/lib/settings/feature-access-settings";
import { isFeatureEnabledForUser } from "@/lib/settings/user-feature-access";
import {
  parseTranslateAccessModeSetting,
  parseTranslateProviderModeSetting,
} from "@/lib/translate/config";
import { translateSourceText } from "@/lib/translate/service";
import { withTimeout } from "@/lib/utils/async";

const requestSchema = z.object({
  mode: z.enum(["speech", "text"]).optional(),
  sourceText: z.string().trim().min(1).max(12_000),
  targetLanguageCode: z.string().trim().min(2).max(16),
});

// Limits are keyed by user only, so rotating networks cannot multiply them.
// The web typed-translation box requests after each 250 ms typing pause.
const TRANSLATE_RATE_LIMIT = {
  limit: 60,
  windowMs: 60 * 1000,
};
const TRANSLATE_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
// Bounds model output cost even when every request carries little text.
const TRANSLATE_DAILY_REQUEST_LIMIT = 1_000;
// Source characters per user per day (Google Translate bills per character).
const TRANSLATE_DAILY_CHARACTER_LIMIT = 150_000;

const TRANSLATE_SETTING_TIMEOUT_MS = 5_000;

// Service errors that are safe to show; anything else gets a generic message.
const TRANSLATE_VALIDATION_ERROR_MESSAGES = [
  "The selected target language is unavailable.",
  "No model is configured for the selected target language.",
  "The selected target language model is unavailable.",
];

function rateLimitedResponse(resetAt: number, message: string) {
  return Response.json(
    { message },
    {
      status: 429,
      headers: {
        "Retry-After": Math.max(
          Math.ceil((resetAt - Date.now()) / 1000),
          1
        ).toString(),
        "Cache-Control": "no-store",
      },
    }
  );
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getMobileSession(request);

  if (!session?.user) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResult = await incrementRateLimit(
    `translate:${session.user.id}`,
    TRANSLATE_RATE_LIMIT
  );

  if (!rateLimitResult.allowed) {
    return rateLimitedResponse(
      rateLimitResult.resetAt,
      "Too many translation requests. Please try again shortly."
    );
  }

  const body = await request.json().catch(() => null);
  const parsedBody = requestSchema.safeParse(body);

  if (!parsedBody.success) {
    return Response.json(
      { message: "Provide source text and a valid target language." },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const [translateAccessSettings, rawProviderModeSetting] = await Promise.all([
    loadFeatureAccessSettingsByKeys([TRANSLATE_FEATURE_FLAG_KEY], {
      source: "api.translate.feature-access",
      timeoutMs: TRANSLATE_SETTING_TIMEOUT_MS,
    }),
    withTimeout(
      getAppSetting<string | boolean | number>(TRANSLATE_PROVIDER_MODE_SETTING_KEY),
      TRANSLATE_SETTING_TIMEOUT_MS
    ).catch((error) => {
      console.error("[api/translate] Failed to load translate provider mode.", error);
      return getLastKnownAppSetting<string | boolean | number>(
        TRANSLATE_PROVIDER_MODE_SETTING_KEY
      );
    }),
  ]);

  const rawTranslateSetting =
    translateAccessSettings.values.get(TRANSLATE_FEATURE_FLAG_KEY) ??
    getLastKnownAppSetting<string | boolean | number>(TRANSLATE_FEATURE_FLAG_KEY);
  const translateMode = parseTranslateAccessModeSetting(rawTranslateSetting);
  const translateSettingsUnavailable =
    translateAccessSettings.status === "unavailable" && rawTranslateSetting == null;

  // Fail closed: an unreadable setting must never open a paid feature.
  if (translateSettingsUnavailable) {
    return Response.json(
      { message: "Translation is temporarily unavailable. Please try again shortly." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  const translateEnabled = await isFeatureEnabledForUser({
    featureKey: TRANSLATE_FEATURE_FLAG_KEY,
    mode: translateMode,
    role: session.user.role,
    source: "api.translate.user-feature-access",
    userId: session.user.id,
  });
  const providerMode = parseTranslateProviderModeSetting(rawProviderModeSetting);

  if (!translateEnabled) {
    return Response.json({ message: "Not found" }, { status: 404 });
  }

  // A denied request still counts, so an exhausted budget stays exhausted
  // until its window resets.
  const dailyLimits = await Promise.all([
    incrementRateLimit(`translate:daily-requests:${session.user.id}`, {
      limit: TRANSLATE_DAILY_REQUEST_LIMIT,
      windowMs: TRANSLATE_DAILY_WINDOW_MS,
    }),
    incrementRateLimit(`translate:daily-characters:${session.user.id}`, {
      limit: TRANSLATE_DAILY_CHARACTER_LIMIT,
      weight: parsedBody.data.sourceText.length,
      windowMs: TRANSLATE_DAILY_WINDOW_MS,
    }),
  ]);
  const deniedDailyLimits = dailyLimits.filter((result) => !result.allowed);

  if (deniedDailyLimits.length > 0) {
    return rateLimitedResponse(
      Math.max(...deniedDailyLimits.map((result) => result.resetAt)),
      "You have reached today's translation limit. Please try again later."
    );
  }

  try {
    const result = await translateSourceText({
      providerMode,
      sourceText: parsedBody.data.sourceText,
      targetLanguageCode: parsedBody.data.targetLanguageCode,
      translationMode: parsedBody.data.mode ?? "text",
    });

    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "";
    const isValidationError =
      TRANSLATE_VALIDATION_ERROR_MESSAGES.includes(errorMessage);

    if (!isValidationError) {
      // Provider errors can carry configuration details or the request text.
      console.error(
        "[api/translate] Translation failed.",
        safeAiErrorDiagnostics(error)
      );
    }

    return Response.json(
      {
        message: isValidationError ? errorMessage : "Translation failed.",
      },
      {
        status: isValidationError ? 400 : 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
