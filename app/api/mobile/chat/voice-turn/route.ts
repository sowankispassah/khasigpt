import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import {
  deleteChatById,
  getActiveChatOwnerById,
  recordTokenUsage,
  saveChat,
  saveMessages,
  touchChatActivityById,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import { generateUUID } from "@/lib/utils";
import { withTimeout } from "@/lib/utils/async";
import { getVoiceChatAccessModeForPlatform } from "@/lib/voice/config";
import { resolveLiveVoiceModelConfig } from "@/lib/voice/live-models";
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
    selectedVisibilityType,
    userText,
  } = parsedBody.data;
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

  let createdChatForTurn = false;

  const chatSaved = await withTimeout(
    (async () => {
      if (chat) {
        await touchChatActivityById({ chatId });
      } else {
        await saveChat({
          id: chatId,
          userId: authContext.user.id,
          title: buildFallbackTitle(userText),
          visibility: selectedVisibilityType,
          mode: "default",
        });
        createdChatForTurn = true;
      }
      return null;
    })(),
    VOICE_TURN_SAVE_TIMEOUT_MS
  )
    .then(() => true)
    .catch((error) => {
      console.error(
        "[api/mobile/chat/voice-turn] Chat activity write failed.",
        error
      );
      return false;
    });
  if (!chatSaved) {
    return voicePersistenceUnavailable();
  }

  const { inputTokens, outputTokens } = resolveLiveVoiceTurnUsage({
    assistantText,
    fallbackTokensPerVoiceInteraction: liveVoiceModel.tokensPerVoiceInteraction,
    inputTokens: parsedBody.data.inputTokens,
    multiplier: liveVoiceModel.creditMultiplier,
    outputTokens: parsedBody.data.outputTokens,
    userText,
  });

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
      if (createdChatForTurn) {
        await deleteChatById({ id: chatId }).catch(() => undefined);
      }
      return Response.json(
        { message: "Insufficient credits remaining" },
        { headers: noStoreHeaders(), status: 402 }
      );
    }
    if (createdChatForTurn) {
      await deleteChatById({ id: chatId }).catch(() => undefined);
    }
    console.error(
      "[api/mobile/chat/voice-turn] Token usage write failed.",
      error
    );
    return voicePersistenceUnavailable();
  }

  try {
    await withTimeout(
      saveMessages({
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
            parts: [
              {
                type: "text",
                text: assistantText,
              },
            ],
            role: "assistant",
          },
        ],
      }),
      VOICE_TURN_SAVE_TIMEOUT_MS
    );
  } catch (error) {
    if (createdChatForTurn) {
      await deleteChatById({ id: chatId }).catch(() => undefined);
    }
    console.error("[api/mobile/chat/voice-turn] Message write failed.", error);
    return voicePersistenceUnavailable();
  }

  return Response.json(
    {
      assistantMessageId,
      chatId,
      ok: true,
      userMessageId,
    },
    { headers: noStoreHeaders() }
  );
}
