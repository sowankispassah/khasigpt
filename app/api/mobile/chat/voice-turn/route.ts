import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import {
  getActiveChatOwnerById,
  getChatById,
  recordTokenUsage,
  saveChatAndMessages,
  saveMessages,
  touchChatActivityById,
  updateChatStatusById,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import { generateUUID } from "@/lib/utils";
import { withTimeout } from "@/lib/utils/async";
import { getVoiceChatAccessModeForPlatform } from "@/lib/voice/config";
import { resolveLiveVoiceModelConfig } from "@/lib/voice/live-models";
import { normalizeKhasiVoiceTranscript } from "@/lib/voice/transcript-normalization";
import { resolveLiveVoiceTurnUsage } from "@/lib/voice/usage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VOICE_MODEL_CONFIG_TIMEOUT_MS = 5_000;
const VOICE_TURN_SAVE_TIMEOUT_MS = 12_000;
const MAX_VOICE_TURN_TEXT_LENGTH = 20_000;

const voiceTurnSchema = z.object({
  assistantMessageId: z.string().uuid().optional(),
  assistantText: z.string().trim().min(1).max(MAX_VOICE_TURN_TEXT_LENGTH),
  chatId: z.string().uuid(),
  inputTokens: z.number().int().positive().optional(),
  outputTokens: z.number().int().positive().optional(),
  selectedLanguageCode: z.string().trim().min(1).max(16).optional(),
  selectedVisibilityType: z.enum(["private", "public"]).default("private"),
  userMessageId: z.string().uuid().optional(),
  userText: z.string().trim().min(1).max(MAX_VOICE_TURN_TEXT_LENGTH),
});

function buildFallbackTitle(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Voice chat";
  }
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

function voicePersistenceUnavailable() {
  return Response.json(
    { message: "Voice chat could not be saved. Please retry." },
    { headers: noStoreHeaders(), status: 503 }
  );
}

function toIsoString(value: Date | string | null | undefined) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? new Date().toISOString()
      : parsed.toISOString();
  }
  return new Date().toISOString();
}

export async function POST(request: Request) {
  const authContext = await getAuthenticatedUser(request, {
    allowCookie: false,
  });

  if (!authContext?.user) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsedBody = voiceTurnSchema.safeParse(body);
  if (!parsedBody.success) {
    return Response.json(
      { message: "A valid voice chat turn is required." },
      { headers: noStoreHeaders(), status: 400 }
    );
  }

  const voiceMode = await getVoiceChatAccessModeForPlatform("android").catch((error) => {
    console.error(
      "[api/mobile/chat/voice-turn] Feature setting read failed.",
      error
    );
    return "enabled" as const;
  });

  if (!isFeatureEnabledForRole(voiceMode, authContext.user.role)) {
    return Response.json(
      { message: "Not found" },
      { headers: noStoreHeaders(), status: 404 }
    );
  }

  const liveVoiceModel = await withTimeout(
    resolveLiveVoiceModelConfig({
      platform: "native",
    }),
    VOICE_MODEL_CONFIG_TIMEOUT_MS
  ).catch((error) => {
    console.error("[api/mobile/chat/voice-turn] Voice model read failed.", error);
    return undefined;
  });
  if (liveVoiceModel === undefined) {
    return Response.json(
      { message: "Voice chat settings could not be confirmed." },
      { headers: noStoreHeaders(), status: 503 }
    );
  }
  if (!liveVoiceModel) {
    return Response.json(
      { message: "Not found" },
      { headers: noStoreHeaders(), status: 404 }
    );
  }

  const {
    assistantText,
    chatId,
    selectedLanguageCode,
    selectedVisibilityType,
  } = parsedBody.data;
  const userText = await normalizeKhasiVoiceTranscript({
    assistantText,
    languageCode: selectedLanguageCode,
    userText: parsedBody.data.userText,
  });
  const userMessageId = parsedBody.data.userMessageId ?? generateUUID();
  const assistantMessageId =
    parsedBody.data.assistantMessageId ?? generateUUID();
  const createdAt = new Date();
  const assistantCreatedAt = new Date(createdAt.getTime() + 1);

  const chat = await withTimeout(
    getActiveChatOwnerById({ id: chatId }),
    VOICE_TURN_SAVE_TIMEOUT_MS
  ).catch((error) => {
    console.error("[api/mobile/chat/voice-turn] Chat read failed.", error);
    return undefined;
  });
  if (chat === undefined) {
    return voicePersistenceUnavailable();
  }
  if (chat && chat.userId !== authContext.user.id) {
    return Response.json(
      { message: "Forbidden" },
      { headers: noStoreHeaders(), status: 403 }
    );
  }

  const { inputTokens, outputTokens } = resolveLiveVoiceTurnUsage({
    assistantText,
    fallbackTokensPerVoiceInteraction: liveVoiceModel.tokensPerVoiceInteraction,
    inputTokens: parsedBody.data.inputTokens,
    multiplier: liveVoiceModel.creditMultiplier,
    outputTokens: parsedBody.data.outputTokens,
    userText,
  });

  let createdChatForTurn = false;
  let chatTitle = buildFallbackTitle(userText);

  try {
    await withTimeout(
      chat
        ? (async () => {
            await touchChatActivityById({ chatId });
            await saveMessages({
              messages: [
                {
                  attachments: [],
                  chatId,
                  createdAt,
                  id: userMessageId,
                  parts: [{ type: "text", text: userText }],
                  role: "user",
                },
                {
                  attachments: [],
                  chatId,
                  createdAt: assistantCreatedAt,
                  id: assistantMessageId,
                  parts: [{ type: "text", text: assistantText }],
                  role: "assistant",
                },
              ],
            });
          })()
        : saveChatAndMessages({
            chatInput: {
              id: chatId,
              userId: authContext.user.id,
              title: chatTitle,
              visibility: selectedVisibilityType,
              mode: "default",
              status: "completed",
            },
            messages: [
              {
                attachments: [],
                chatId,
                createdAt,
                id: userMessageId,
                parts: [{ type: "text", text: userText }],
                role: "user",
              },
              {
                attachments: [],
                chatId,
                createdAt: assistantCreatedAt,
                id: assistantMessageId,
                parts: [{ type: "text", text: assistantText }],
                role: "assistant",
              },
            ],
          }).then(() => {
            createdChatForTurn = true;
          }),
      VOICE_TURN_SAVE_TIMEOUT_MS
    );
  } catch (error) {
    console.error("[api/mobile/chat/voice-turn] Message write failed.", error);
    return voicePersistenceUnavailable();
  }

  const savedChat = await withTimeout(
    getChatById({ id: chatId }),
    VOICE_TURN_SAVE_TIMEOUT_MS
  ).catch((error) => {
    console.error("[api/mobile/chat/voice-turn] Saved chat read failed.", error);
    return null;
  });
  if (savedChat?.title) {
    chatTitle = savedChat.title;
  }

  let usageRecorded = true;
  let usageError: string | null = null;

  try {
    await withTimeout(
      recordTokenUsage({
        chatId,
        inputTokens,
        liveVoiceModelConfigId: liveVoiceModel.id,
        modelConfigId: null,
        outputTokens,
        userId: authContext.user.id,
      }),
      VOICE_TURN_SAVE_TIMEOUT_MS
    );
  } catch (error) {
    if (
      error instanceof ChatSDKError &&
      error.type === "payment_required"
    ) {
      usageRecorded = false;
      usageError = "insufficient_credits";
      await updateChatStatusById({
        chatId,
        status: "completed",
        statusReason: "Voice chat transcript saved; credits could not be deducted.",
      }).catch(() => undefined);
    } else {
      usageRecorded = false;
      usageError = "usage_record_failed";
      console.error(
        "[api/mobile/chat/voice-turn] Token usage write failed.",
        error
      );
    }
    if (createdChatForTurn && usageError === "usage_record_failed") {
      await updateChatStatusById({
        chatId,
        status: "completed",
        statusReason: "Voice chat transcript saved; usage could not be recorded.",
      }).catch(() => undefined);
    }
  }

  const activityAt = savedChat?.createdAt ?? createdAt;

  return Response.json(
    {
      assistantMessageId,
      chat: {
        createdAt: toIsoString(activityAt),
        id: chatId,
        mode: "default",
        status: "completed",
        statusReason: usageRecorded
          ? null
          : "Voice chat transcript saved; usage could not be confirmed.",
        title: chatTitle,
        updatedAt: toIsoString(activityAt),
        visibility: savedChat?.visibility ?? selectedVisibilityType,
      },
      chatId,
      ok: true,
      usageError,
      usageRecorded,
      userText,
      userMessageId,
    },
    { headers: noStoreHeaders() }
  );
}
