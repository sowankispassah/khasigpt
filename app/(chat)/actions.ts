"use server";

import { generateText, type UIMessage } from "ai";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/app/(auth)/auth";
import type { VisibilityType } from "@/components/visibility-selector";
import { getTitleLanguageModel } from "@/lib/ai/providers";
import {
  createAuditLogEntry,
  createUserSubscription,
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatVisiblityById,
} from "@/lib/db/queries";

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set("chat-model", model);
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: UIMessage;
}) {
  const { text: title } = await generateText({
    model: getTitleLanguageModel(),
    system: `\n
    - you will generate a short title based on the first message a user begins a conversation with
    - ensure it is not more than 80 characters long
    - the title should be a summary of the user's message
    - do not use quotes or colons`,
    prompt: JSON.stringify(message),
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

  const subscription = await createUserSubscription({
    userId: session.user.id,
    planId,
  });

  await createAuditLogEntry({
    actorId: session.user.id,
    action: "billing.recharge",
    target: { subscriptionId: subscription.id, planId },
  });

  revalidatePath("/", "layout");
  revalidatePath("/chat");
  revalidatePath("/recharge");
  revalidatePath("/analytics");
}
