"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import type { VisibilityType } from "@/components/visibility-selector";
import {
  createAuditLogEntry,
  createUserSubscription,
  deleteMessagesByChatIdAfterTimestamp,
  getChatById,
  getMessageById,
  saveChat,
  updateChatVisiblityById,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getClientInfoFromHeaders } from "@/lib/security/client-info";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getChatRequestSession } from "./chat-route-session";

export async function saveChatLanguageAsCookie(languageCode: string) {
  const cookieStore = await cookies();
  cookieStore.set("chat-language", languageCode, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  if (!z.string().uuid().safeParse(id).success)
    throw new ChatSDKError("bad_request:api");
  const userId = await requireChatMutationUser();
  const [message] = await getMessageById({ id });
  if (!message) throw new ChatSDKError("not_found:chat");
  await requireOwnedChat(message.chatId, userId);

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  if (
    !z
      .object({
        chatId: z.string().uuid(),
        visibility: z.enum(["private", "public"]),
      })
      .safeParse({ chatId, visibility }).success
  )
    throw new ChatSDKError("bad_request:api");
  const userId = await requireChatMutationUser();
  await requireOwnedChat(chatId, userId);
  await updateChatVisiblityById({ chatId, visibility });
}

async function requireChatMutationUser() {
  const session = await getChatRequestSession();
  if (!session?.user) throw new ChatSDKError("unauthorized:api");
  const result = await incrementRateLimit(`chat-mutation:${session.user.id}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!result.allowed)
    throw new ChatSDKError(
      result.reason === "unavailable" ? "offline:api" : "rate_limit:api",
    );
  return session.user.id;
}

async function requireOwnedChat(chatId: string, userId: string) {
  const chat = await getChatById({ id: chatId });
  if (!chat) throw new ChatSDKError("not_found:chat");
  if (chat.userId !== userId) throw new ChatSDKError("forbidden:chat");
}

function buildPendingChatTitle({
  firstMessageText,
  mode,
}: {
  firstMessageText: string;
  mode: "default" | "study" | "jobs" | "news";
}) {
  if (mode === "study") {
    return "Study";
  }
  if (mode === "news") {
    return "News";
  }

  const normalized = firstMessageText.trim().replace(/\s+/g, " ");
  if (!normalized.length) {
    return "New Chat";
  }

  return normalized.length <= 80 ? normalized : normalized.slice(0, 80);
}

export async function ensureChatExistsAction({
  chatId,
  visibility,
  mode,
  firstMessageText,
}: {
  chatId: string;
  visibility: VisibilityType;
  mode: "default" | "study" | "jobs" | "news";
  firstMessageText: string;
}) {
  if (
    !z
      .object({
        chatId: z.string().uuid(),
        visibility: z.enum(["private", "public"]),
        mode: z.enum(["default", "study", "jobs", "news"]),
        firstMessageText: z.string().max(8000),
      })
      .safeParse({ chatId, visibility, mode, firstMessageText }).success
  )
    throw new ChatSDKError("bad_request:api");
  const userId = await requireChatMutationUser();

  const existing = await getChatById({ id: chatId });
  if (existing) {
    if (existing.userId !== userId) {
      throw new ChatSDKError("forbidden:chat");
    }
    return { id: existing.id, existed: true };
  }

  await saveChat({
    id: chatId,
    userId,
    title: buildPendingChatTitle({ firstMessageText, mode }),
    visibility,
    mode,
  });

  return { id: chatId, existed: false };
}

export async function rechargeSubscriptionAction(formData: FormData) {
  "use server";
  const session = await getChatRequestSession();

  if (!session?.user) {
    throw new Error("unauthorized");
  }

  const planId = formData.get("planId")?.toString();

  if (!planId) {
    throw new Error("missing plan id");
  }

  const clientInfo = await getClientInfoFromHeaders();
  const subscription = await createUserSubscription({
    userId: session.user.id,
    planId,
  });

  await createAuditLogEntry({
    actorId: session.user.id,
    action: "billing.recharge",
    target: { subscriptionId: subscription.id, planId },
    subjectUserId: session.user.id,
    ...clientInfo,
  });

  revalidatePath("/", "layout");
  revalidatePath("/chat");
  revalidatePath("/recharge");
  revalidatePath("/subscriptions");
}
