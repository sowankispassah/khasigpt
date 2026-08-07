import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import {
  getActiveChatOwnerById,
  getAppSetting,
  getLastKnownAppSetting,
  recordTokenUsage,
  saveChatAndMessages,
  saveMessages,
  touchChatActivityById,
  updateChatStatusById,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import {
  getLiveTranslationAccessModeForPlatform,
  getLiveTranslationLanguageName,
  LIVE_TRANSLATION_ACCESS_MODE_FALLBACK,
  LIVE_TRANSLATION_SUPPORTED_LANGUAGES_SETTING_KEY,
  normalizeLiveTranslationLanguages,
} from "@/lib/live-translation/config";
import { generateUUID } from "@/lib/utils";
import { withTimeout } from "@/lib/utils/async";
import { resolveLiveVoiceModelConfig } from "@/lib/voice/live-models";
import { normalizeKhasiVoiceTranscript } from "@/lib/voice/transcript-normalization";
import { resolveLiveVoiceTurnUsage } from "@/lib/voice/usage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIVE_TRANSLATION_SESSION_SAVE_TIMEOUT_MS = 12_000;
const LIVE_TRANSLATION_MODEL_CONFIG_TIMEOUT_MS = 5_000;
const MAX_LIVE_TRANSLATION_TEXT_LENGTH = 20_000;
const MAX_LIVE_TRANSLATION_TURNS = 80;

const liveTranslationTurnSchema = z.object({
  id: z.string().optional(),
  inputTokens: z.number().int().positive().optional(),
  originalText: z.string().trim().min(1).max(MAX_LIVE_TRANSLATION_TEXT_LENGTH),
  outputTokens: z.number().int().positive().optional(),
  timestamp: z.string().datetime().optional(),
  translatedText: z
    .string()
    .trim()
    .min(1)
    .max(MAX_LIVE_TRANSLATION_TEXT_LENGTH),
});

const liveTranslationSessionSchema = z.object({
  chatId: z.string().uuid().optional(),
  languageACode: z.string().trim().min(2).max(16),
  languageBCode: z.string().trim().min(2).max(16),
  selectedVisibilityType: z.enum(["private", "public"]).default("private"),
  turns: z.array(liveTranslationTurnSchema).min(1).max(MAX_LIVE_TRANSLATION_TURNS),
});

type SavedLiveTranslationTurn = {
  assistantMessageId: string;
  id: string;
  originalText: string;
  timestamp: string;
  translatedText: string;
  userMessageId: string;
};

function liveTranslationPersistenceUnavailable() {
  return Response.json(
    { message: "Live Translation could not be saved. Please retry." },
    { headers: noStoreHeaders(), status: 503 }
  );
}

function buildFallbackTitle(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Live Translation";
  }
  const title = `Live Translation: ${normalized}`;
  return title.length > 80 ? `${title.slice(0, 77)}...` : title;
}

function shouldNormalizeKhasi({
  languageACode,
  languageBCode,
}: {
  languageACode: string;
  languageBCode: string;
}) {
  return languageACode === "kha" || languageBCode === "kha";
}

export async function POST(request: Request) {
  const authContext = await getAuthenticatedUser(request, {
    allowBearer: false,
  });

  if (!authContext?.user) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = liveTranslationSessionSchema.safeParse(body);
  if (!parsedBody.success) {
    return Response.json(
      { message: "A valid Live Translation session is required." },
      { headers: noStoreHeaders(), status: 400 }
    );
  }

  const accessMode = await getLiveTranslationAccessModeForPlatform("web").catch(
    (error) => {
      console.error(
        "[api/live-translation/session] Feature setting read failed.",
        error
      );
      return LIVE_TRANSLATION_ACCESS_MODE_FALLBACK;
    }
  );

  if (!isFeatureEnabledForRole(accessMode, authContext.user.role)) {
    return Response.json(
      { message: "Not found" },
      { headers: noStoreHeaders(), status: 404 }
    );
  }

  const liveVoiceModel = await withTimeout(
    resolveLiveVoiceModelConfig({
      platform: "web",
    }),
    LIVE_TRANSLATION_MODEL_CONFIG_TIMEOUT_MS
  ).catch((error) => {
    console.error(
      "[api/live-translation/session] Voice model read failed.",
      error
    );
    return undefined;
  });
  if (liveVoiceModel === undefined) {
    return Response.json(
      { message: "Live Translation settings could not be confirmed." },
      { headers: noStoreHeaders(), status: 503 }
    );
  }
  if (!liveVoiceModel) {
    return Response.json(
      { message: "Not found" },
      { headers: noStoreHeaders(), status: 404 }
    );
  }

  const languagesValue = await withTimeout(
    getAppSetting<unknown>(LIVE_TRANSLATION_SUPPORTED_LANGUAGES_SETTING_KEY),
    LIVE_TRANSLATION_MODEL_CONFIG_TIMEOUT_MS
  ).catch((error) => {
    console.error(
      "[api/live-translation/session] Supported languages read failed.",
      error
    );
    return getLastKnownAppSetting<unknown>(
      LIVE_TRANSLATION_SUPPORTED_LANGUAGES_SETTING_KEY
    );
  });
  const languages = normalizeLiveTranslationLanguages(languagesValue);
  const languageACode = parsedBody.data.languageACode.toLowerCase();
  const languageBCode = parsedBody.data.languageBCode.toLowerCase();
  const languageAName = getLiveTranslationLanguageName({
    code: languageACode,
    languages,
  });
  const languageBName = getLiveTranslationLanguageName({
    code: languageBCode,
    languages,
  });
  const normalizeKhasi = shouldNormalizeKhasi({ languageACode, languageBCode });

  const createdAt = new Date();
  const chatId = parsedBody.data.chatId ?? generateUUID();
  const messages: DBMessage[] = [];
  const savedTurns: SavedLiveTranslationTurn[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const [index, turn] of parsedBody.data.turns.entries()) {
    const rawTranslatedText = turn.translatedText.trim();
    const rawOriginalText = turn.originalText.trim();
    const normalizedOriginalText = normalizeKhasi
      ? await normalizeKhasiVoiceTranscript({
          assistantText: rawTranslatedText,
          languageCode: "kha",
          userText: rawOriginalText,
        })
      : rawOriginalText;
    const translatedText = normalizeKhasi
      ? await normalizeKhasiVoiceTranscript({
          assistantText: normalizedOriginalText,
          languageCode: "kha",
          userText: rawTranslatedText,
        })
      : rawTranslatedText;
    const timestamp = turn.timestamp ?? createdAt.toISOString();
    const userMessageId = generateUUID();
    const assistantMessageId = generateUUID();
    const userCreatedAt = new Date(createdAt.getTime() + index * 2);
    const assistantCreatedAt = new Date(createdAt.getTime() + index * 2 + 1);

    messages.push({
      attachments: [],
      chatId,
      createdAt: userCreatedAt,
      id: userMessageId,
      parts: [{ type: "text" as const, text: normalizedOriginalText }],
      role: "user",
    });
    messages.push({
      attachments: [],
      chatId,
      createdAt: assistantCreatedAt,
      id: assistantMessageId,
      parts: [{ type: "text" as const, text: translatedText }],
      role: "assistant",
    });

    savedTurns.push({
      assistantMessageId,
      id: turn.id ?? userMessageId,
      originalText: normalizedOriginalText,
      timestamp,
      translatedText,
      userMessageId,
    });

    const usage = resolveLiveVoiceTurnUsage({
      assistantText: translatedText,
      fallbackTokensPerVoiceInteraction:
        liveVoiceModel.tokensPerVoiceInteraction,
      inputTokens: turn.inputTokens,
      multiplier: liveVoiceModel.creditMultiplier,
      outputTokens: turn.outputTokens,
      userText: normalizedOriginalText,
    });
    totalInputTokens += usage.inputTokens;
    totalOutputTokens += usage.outputTokens;
  }

  const existingChat = await withTimeout(
    getActiveChatOwnerById({ id: chatId }),
    LIVE_TRANSLATION_SESSION_SAVE_TIMEOUT_MS
  ).catch((error) => {
    console.error("[api/live-translation/session] Chat read failed.", error);
    return undefined;
  });
  if (existingChat === undefined) {
    return liveTranslationPersistenceUnavailable();
  }
  if (existingChat && existingChat.userId !== authContext.user.id) {
    return Response.json(
      { message: "Forbidden" },
      { headers: noStoreHeaders(), status: 403 }
    );
  }

  try {
    await withTimeout(
      existingChat
        ? (async () => {
            await touchChatActivityById({ chatId });
            await saveMessages({ messages });
          })()
        : saveChatAndMessages({
            chatInput: {
              id: chatId,
              userId: authContext.user.id,
              title: buildFallbackTitle(savedTurns[0]?.originalText ?? ""),
              visibility: parsedBody.data.selectedVisibilityType,
              mode: "default",
              status: "completed",
            },
            messages,
          }),
      LIVE_TRANSLATION_SESSION_SAVE_TIMEOUT_MS
    );
  } catch (error) {
    console.error("[api/live-translation/session] Message write failed.", error);
    return liveTranslationPersistenceUnavailable();
  }

  try {
    await withTimeout(
      recordTokenUsage({
        chatId,
        inputTokens: totalInputTokens,
        liveVoiceModelConfigId: liveVoiceModel.id,
        modelConfigId: null,
        outputTokens: totalOutputTokens,
        userId: authContext.user.id,
      }),
      LIVE_TRANSLATION_SESSION_SAVE_TIMEOUT_MS
    );
  } catch (error) {
    if (error instanceof ChatSDKError && error.type === "payment_required") {
      await updateChatStatusById({
        chatId,
        status: "failed",
        statusReason: "Insufficient credits remaining",
      }).catch(() => undefined);
      return Response.json(
        { message: "Insufficient credits remaining" },
        { headers: noStoreHeaders(), status: 402 }
      );
    }
    await updateChatStatusById({
      chatId,
      status: "failed",
      statusReason: "Live Translation usage could not be recorded.",
    }).catch(() => undefined);
    console.error(
      "[api/live-translation/session] Token usage write failed.",
      error
    );
    return liveTranslationPersistenceUnavailable();
  }

  return Response.json(
    {
      chatId,
      languageA: { code: languageACode, name: languageAName },
      languageB: { code: languageBCode, name: languageBName },
      ok: true,
      turns: savedTurns,
    },
    { headers: noStoreHeaders() }
  );
}
