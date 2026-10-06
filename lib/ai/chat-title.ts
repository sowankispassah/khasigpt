import "server-only";
import { generateText, type UIMessage } from "ai";
import { cookies } from "next/headers";
import { getTitleLanguageModel } from "@/lib/ai/providers";
import type { ModelConfig } from "@/lib/db/schema";

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
        (part): part is { type: "text"; text: string } => part.type === "text",
      )
      .map((part) => part.text)
      .join("") ?? "";

  const { text: title } = await generateText({
    model: getTitleLanguageModel(modelConfig),
    maxOutputTokens: 256,
    maxRetries: 0,
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
      text: userText.slice(0, 8000),
      preferredLanguageCode,
    }),
  });

  return title.trim().slice(0, 80);
}
