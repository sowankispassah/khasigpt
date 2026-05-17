import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { VOICE_CHAT_FEATURE_FLAG_KEY } from "@/lib/constants";
import {
  getAppSetting,
  getChatById,
  getLastKnownAppSetting,
  saveChat,
  saveMessages,
  touchChatActivityById,
} from "@/lib/db/queries";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import { generateUUID } from "@/lib/utils";
import { withTimeout } from "@/lib/utils/async";
import { parseVoiceChatAccessModeSetting } from "@/lib/voice/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VOICE_SETTING_TIMEOUT_MS = 5_000;
const VOICE_TURN_SAVE_TIMEOUT_MS = 12_000;
const MAX_VOICE_TURN_TEXT_LENGTH = 20_000;

const voiceTurnSchema = z.object({
  assistantMessageId: z.string().uuid().optional(),
  assistantText: z.string().trim().min(1).max(MAX_VOICE_TURN_TEXT_LENGTH),
  chatId: z.string().uuid(),
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

  const rawVoiceSetting = await withTimeout(
    getAppSetting<string | boolean | number>(VOICE_CHAT_FEATURE_FLAG_KEY),
    VOICE_SETTING_TIMEOUT_MS
  ).catch(() =>
    getLastKnownAppSetting<string | boolean | number>(VOICE_CHAT_FEATURE_FLAG_KEY)
  );

  const voiceMode = parseVoiceChatAccessModeSetting(rawVoiceSetting);
  if (!isFeatureEnabledForRole(voiceMode, authContext.user.role)) {
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
    getChatById({ id: chatId }),
    VOICE_TURN_SAVE_TIMEOUT_MS
  );
  if (chat && chat.userId !== authContext.user.id) {
    return Response.json(
      { message: "Forbidden" },
      { headers: noStoreHeaders(), status: 403 }
    );
  }

  await withTimeout(
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
      }
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
            parts: [
              {
                type: "text",
                text: assistantText,
              },
            ],
            role: "assistant",
          },
        ],
      });
      return null;
    })(),
    VOICE_TURN_SAVE_TIMEOUT_MS
  );

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
