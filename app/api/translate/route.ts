import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  TRANSLATE_FEATURE_FLAG_KEY,
  TRANSLATE_PROVIDER_MODE_SETTING_KEY,
} from "@/lib/constants";
import { getAppSetting, getLastKnownAppSetting } from "@/lib/db/queries";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";
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

const TRANSLATE_RATE_LIMIT = {
  limit: 120,
  windowMs: 60 * 1000,
};

const TRANSLATE_SETTING_TIMEOUT_MS = 5_000;

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const clientKey = getClientKeyFromHeaders(request.headers);
  const rateLimitResult = await incrementRateLimit(
    `translate:${session.user.id}:${clientKey}`,
    TRANSLATE_RATE_LIMIT
  );

  if (!rateLimitResult.allowed) {
    const retryAfterSeconds = Math.max(
      Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000),
      1
    ).toString();

    return Response.json(
      { message: "Too many translation requests. Please try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfterSeconds,
          "Cache-Control": "no-store",
        },
      }
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

  const [rawTranslateSetting, rawProviderModeSetting] = await Promise.all([
    withTimeout(
      getAppSetting<string | boolean | number>(TRANSLATE_FEATURE_FLAG_KEY),
      TRANSLATE_SETTING_TIMEOUT_MS
    ).catch((error) => {
      console.error("[api/translate] Failed to load translate feature setting.", error);
      return getLastKnownAppSetting<string | boolean | number>(
        TRANSLATE_FEATURE_FLAG_KEY
      );
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

  const translateMode = parseTranslateAccessModeSetting(rawTranslateSetting);
  const translateEnabled = isFeatureEnabledForRole(
    translateMode,
    session.user.role
  );
  const providerMode = parseTranslateProviderModeSetting(rawProviderModeSetting);

  if (!translateEnabled) {
    return Response.json({ message: "Not found" }, { status: 404 });
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
    console.error("[api/translate] Translation failed.", error);

    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : "Translation failed.";

    const status = [
      "The selected target language is unavailable.",
      "No model is configured for the selected target language.",
      "The selected target language model is unavailable.",
    ].includes(message)
      ? 400
      : 500;

    return Response.json(
      {
        message,
      },
      {
        status,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
