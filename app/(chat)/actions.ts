"use server";

import { generateText, type UIMessage } from "ai";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { auth } from "@/app/(auth)/auth";
import type { VisibilityType } from "@/components/visibility-selector";
import { getTitleLanguageModel } from "@/lib/ai/providers";
import {
  createAuditLogEntry,
  createUserSubscription,
  deleteMessagesByChatIdAfterTimestamp,
  getChatById,
  getMessageById,
  saveChat,
  updateChatVisiblityById,
} from "@/lib/db/queries";
import type { ModelConfig } from "@/lib/db/schema";
import { getClientInfoFromHeaders } from "@/lib/security/client-info";

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set("chat-model", model, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function saveChatLanguageAsCookie(languageCode: string) {
  const cookieStore = await cookies();
  cookieStore.set("chat-language", languageCode, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function generateTitleFromUserMessage({
  message,
  modelConfig,
}: {
  message: UIMessage;
  modelConfig?: ModelConfig | null;
}) {
  const cookieStore = await cookies();
  const preferredLanguageCode = cookieStore.get("lang")?.value ?? null;
  const userText =
    message.parts
      ?.filter(
        (part): part is { type: "text"; text: string } => part.type === "text"
      )
      .map((part) => part.text)
      .join("") ?? "";

  const { text: title } = await generateText({
    model: getTitleLanguageModel(modelConfig),
    system: `\n
    - you will generate a short title based on the first message a user begins a conversation with
    - ensure it is not more than 80 characters long
    - the title should be a summary of the user's message
    - do not use quotes or colons
    - detect the primary language used in the user's message text and respond entirely in that same language (for example, Khasi text must yield a Khasi title)
    - if multiple languages are present, prioritise the language that dominates the message or the first non-English language
    - only fall back to ${
      preferredLanguageCode
        ? `the locale identified by code "${preferredLanguageCode}"`
        : "Khasi"
    } if you cannot detect the language
    - never translate a non-English message into English unless the user already wrote in English`,
    prompt: JSON.stringify({
      text: userText,
      message,
      preferredLanguageCode,
    }),
  });

  return title;
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const [message] = await getMessageById({ id });

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
  await updateChatVisiblityById({ chatId, visibility });
}

function buildPendingChatTitle({
  firstMessageText,
  mode,
}: {
  firstMessageText: string;
  mode: "default" | "study" | "jobs";
}) {
  if (mode === "study") {
    return "Study";
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
  mode: "default" | "study" | "jobs";
  firstMessageText: string;
}) {
  const session = await auth();

  if (!session?.user) {
    throw new Error("unauthorized");
  }

  const existing = await getChatById({ id: chatId });
  if (existing) {
    if (existing.userId !== session.user.id) {
      throw new Error("forbidden");
    }
    return { id: existing.id, existed: true };
  }

  await saveChat({
    id: chatId,
    userId: session.user.id,
    title: buildPendingChatTitle({ firstMessageText, mode }),
    visibility,
    mode,
  });

  return { id: chatId, existed: false };
}

export async function rechargeSubscriptionAction(formData: FormData) {
  "use server";
  const session = await auth();

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
