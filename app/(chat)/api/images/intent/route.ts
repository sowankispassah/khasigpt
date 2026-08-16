import { z } from "zod";
import { classifyImageIntent } from "@/lib/ai/image-intent-classifier";
import { createImageIntentToken } from "@/lib/ai/image-intent-token";
import { ChatSDKError } from "@/lib/errors";
import {
  type ImageIntentInput,
  shouldClassifyImageIntent,
} from "@/lib/image-intent";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const intentRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  imageHintSelected: z.boolean(),
  hasImageAttachment: z.boolean(),
  hasPriorGeneratedImage: z.boolean(),
  recentMessages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().max(1000),
        hasImage: z.boolean(),
      })
    )
    .max(8),
});

export async function POST(request: Request) {
  const startedAt = performance.now();
  const session = await getMobileSession(request);
  if (!session?.user) {
    return new ChatSDKError("unauthorized:auth").toResponse();
  }

  const clientKey = getClientKeyFromHeaders(request.headers);
  const rateLimit = await incrementRateLimit(
    `api:image-intent:${session.user.id}:${clientKey}`,
    { limit: 60, windowMs: 60 * 1000 }
  );
  if (!rateLimit.allowed) {
    return Response.json(
      { code: "rate_limit:api", message: "Too many requests." },
      { status: 429 }
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = intentRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { code: "bad_request:api", message: "Invalid intent request." },
      { status: 400 }
    );
  }

  const input: ImageIntentInput = parsed.data;
  const intent = shouldClassifyImageIntent(input)
    ? await classifyImageIntent(input)
    : "normal_chat";
  const durationMs = Math.round(performance.now() - startedAt);
  const decisionToken =
    intent === "image_generate" || intent === "image_edit"
      ? createImageIntentToken({
          intent,
          prompt: input.message,
          userId: session.user.id,
        })
      : null;

  return Response.json(
    { intent, decisionToken },
    {
      headers: {
        "Cache-Control": "no-store",
        "Server-Timing": `image-intent;dur=${durationMs}`,
      },
    }
  );
}
