import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { resolveSavedMessageTimestamp } from "@/lib/chat/saved-message-timestamp";
import { VOICE_CHAT_WEB_FEATURE_FLAG_KEY } from "@/lib/constants";
import {
  getActiveChatOwnerById,
  getMessageById,
  recordTokenUsage,
  saveChatAndMessagesWithTimestamps as saveChatAndMessages,
  saveMessages,
  touchChatActivityById,
  updateChatStatusById,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { isFeatureEnabledForUser } from "@/lib/settings/user-feature-access";
import { generateUUID } from "@/lib/utils";
import { withTimeout } from "@/lib/utils/async";
import { getVoiceChatAccessModeForPlatform } from "@/lib/voice/config";
import { findOwnedVoiceSession } from "@/lib/voice/duration-session";
import { resolveLiveVoiceModelConfig } from "@/lib/voice/live-models";
import { enforceLiveSessionLaunchAccess } from "@/lib/voice/live-session-access";
import { normalizeKhasiVoiceTranscript } from "@/lib/voice/transcript-normalization";
import { resolveLiveVoiceTurnUsage } from "@/lib/voice/usage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VOICE_MODEL_CONFIG_TIMEOUT_MS = 5_000;
const VOICE_TURN_SAVE_TIMEOUT_MS = 12_000;
const MAX_VOICE_TURN_TEXT_LENGTH = 20_000;

const voiceTurnSchema = z.object({
  voiceSessionId: z.string().uuid().optional(),
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

export async function POST(request: Request) {
  const authContext = await getAuthenticatedUser(request, {
    allowBearer: false,
  });

  if (!authContext?.user) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const launchDenied = await enforceLiveSessionLaunchAccess(authContext.user);
  if (launchDenied) return launchDenied;

  const body = await request.json().catch(() => null);
  const parsedBody = voiceTurnSchema.safeParse(body);
  if (!parsedBody.success) {
    return Response.json(
      { message: "A valid voice chat turn is required." },
      { headers: noStoreHeaders(), status: 400 }
    );
  }

  const voiceMode = await getVoiceChatAccessModeForPlatform("web").catch((error) => {
    console.error("[api/chat/voice-turn] Feature setting read failed.", error);
    return "disabled" as const;
  });

  if (!(await isFeatureEnabledForUser({
    featureKey: VOICE_CHAT_WEB_FEATURE_FLAG_KEY,
    mode: voiceMode,
    role: authContext.user.role,
    source: "api.chat.voice-turn.user-feature-access",
    userId: authContext.user.id,
  }))) {
    return Response.json(
      { message: "Not found" },
      { headers: noStoreHeaders(), status: 404 }
    );
  }

  const ownedSession = parsedBody.data.voiceSessionId ? await findOwnedVoiceSession(parsedBody.data.voiceSessionId, authContext.user.id) : null;
  if (parsedBody.data.voiceSessionId && (!ownedSession?.providerSessionId || ownedSession.status === "failed")) return Response.json({ message: "Voice session could not be confirmed." }, { status: 403, headers: noStoreHeaders() });
  const liveVoiceModel = ownedSession ? { id: ownedSession.modelConfigId, durationPricing: true } : await withTimeout(
    resolveLiveVoiceModelConfig({
      platform: "web",
    }),
    VOICE_MODEL_CONFIG_TIMEOUT_MS
  ).catch((error) => {
    console.error("[api/chat/voice-turn] Voice model read failed.", error);
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

  if (!ownedSession && liveVoiceModel.durationPricing) return Response.json({ message: "A confirmed voice session is required." }, { status: 409, headers: noStoreHeaders() });

  const {
    assistantText,
    chatId,
    selectedLanguageCode,
    selectedVisibilityType,
  } =
    parsedBody.data;
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
    console.error("[api/chat/voice-turn] Chat read failed.", error);
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
    inputTokens: parsedBody.data.inputTokens,
    outputTokens: parsedBody.data.outputTokens,
    userText,
  });

  let createdChatForTurn = false;
  let insertedTimestamps: { id: string; createdAt: Date }[] = [];

  try {
    await withTimeout(
      chat
        ? (async () => {
            await touchChatActivityById({ chatId });
            insertedTimestamps = await saveMessages({
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
              title: buildFallbackTitle(userText),
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
          }).then((saved) => {
            insertedTimestamps = saved;
            createdChatForTurn = true;
          }),
      VOICE_TURN_SAVE_TIMEOUT_MS
    );
  } catch (error) {
    console.error("[api/chat/voice-turn] Message write failed.", error);
    return voicePersistenceUnavailable();
  }

  try {
    if (!ownedSession) await withTimeout(
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
    if (createdChatForTurn) {
      await updateChatStatusById({
        chatId,
        status: "failed",
        statusReason: "Voice chat usage could not be recorded.",
      }).catch(() => undefined);
    }
    console.error("[api/chat/voice-turn] Token usage write failed.", error);
    return voicePersistenceUnavailable();
  }

  const [userTimestamp, assistantTimestamp] = await Promise.all([
    resolveSavedMessageTimestamp({ inserted: insertedTimestamps, messageId: userMessageId, chatId, role: "user", findExisting: (id) => getMessageById({ id }) }),
    resolveSavedMessageTimestamp({ inserted: insertedTimestamps, messageId: assistantMessageId, chatId, role: "assistant", findExisting: (id) => getMessageById({ id }) }),
  ]);

  return Response.json(
    {
      assistantMessageId,
      userTimestamp,
      assistantTimestamp,
      chatId,
      ok: true,
      userText,
      userMessageId,
    },
    { headers: noStoreHeaders() }
  );
}
