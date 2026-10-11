import { z } from "zod";
import {
  createContactMessage,
  getChatById,
  getMessageById,
} from "@/lib/db/queries";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { incrementRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const reportSchema = z.object({
  chatId: z.string().uuid(),
  messageId: z.string().uuid(),
  category: z.enum(["incorrect", "not_requested", "slow_buggy", "style_tone", "safety", "other"]).default("safety"),
  details: z.string().trim().max(2000).optional(),
});

const categoryLabels = {
  incorrect: "Incorrect or incomplete",
  not_requested: "Not what I asked for",
  slow_buggy: "Slow or buggy",
  style_tone: "Style or tone",
  safety: "Safety or offensive content",
  other: "Other",
} as const;

function json(body: unknown, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const session = await getMobileSession(request);
  if (!session?.user?.id || !session.user.email) {
    return json({ error: "Sign in to report content." }, 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid report." }, 400);
  }

  const { chatId, messageId, category, details } = parsed.data;
  try {
    const chat = await getChatById({ id: chatId });
    if (!chat || chat.userId !== session.user.id) {
      return json({ error: "Chat not found." }, 404);
    }

    const [message] = await getMessageById({ id: messageId });
    if (!message || message.chatId !== chatId || message.role !== "assistant") {
      return json({ error: "Response not found." }, 404);
    }

    const { allowed, resetAt } = await incrementRateLimit(
      `ai-content-report:${session.user.id}`,
      { limit: 10, windowMs: 60 * 60 * 1000 }
    );
    if (!allowed) {
      return Response.json(
        { error: "Too many reports. Please try again later." },
        {
          status: 429,
          headers: {
            "Cache-Control": "no-store",
            "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))),
          },
        }
      );
    }

    const excerpt = Array.isArray(message.parts)
      ? message.parts
          .filter((part) => part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part && typeof part.text === "string")
          .map((part) => (part as { text: string }).text)
          .join("\n")
          .slice(0, 1500)
      : "";

    await createContactMessage({
      kind: "report",
      name: session.user.name?.trim() || "App user",
      email: session.user.email,
      subject: category === "safety" ? "AI content report" : "AI response feedback",
      message: `Feedback category: ${categoryLabels[category]}\nUser details: ${details || "[None provided]"}\nChat ID: ${chatId}\nMessage ID: ${messageId}\nChat URL: https://khasigpt.com/chat/${chatId}\nResponse excerpt: ${excerpt || "[Non-text response]"}`,
    });

    return json({ ok: true }, 200);
  } catch {
    return json({ error: "Report could not be sent. Please try again." }, 500);
  }
}
