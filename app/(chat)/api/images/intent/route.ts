import { z } from "zod";
import { createImageIntentToken } from "@/lib/ai/image-intent-token";
import { classifyToolIntent } from "@/lib/ai/tool-intent-classifier";
import { createToolIntentToken } from "@/lib/ai/web-search-intent-token";
import { ChatSDKError } from "@/lib/errors";
import {
  type ImageIntentInput,
  shouldClassifyImageIntent,
} from "@/lib/image-intent";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { RequestBodyLimitError, readBoundedJson, requestLimitResponse } from "@/lib/security/request-body";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Each request may run an unbilled classifier model call. Limits are keyed by
// user only, so rotating networks cannot multiply them.
const IMAGE_INTENT_RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };
const IMAGE_INTENT_DAILY_RATE_LIMIT = {
  limit: 500,
  windowMs: 24 * 60 * 60 * 1000,
};

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

  const [shortTermLimit, dailyLimit] = await Promise.all([
    incrementRateLimit(
      `api:image-intent:${session.user.id}`,
      IMAGE_INTENT_RATE_LIMIT
    ),
    incrementRateLimit(
      `api:image-intent:daily:${session.user.id}`,
      IMAGE_INTENT_DAILY_RATE_LIMIT
    ),
  ]);
  if (!shortTermLimit.allowed || !dailyLimit.allowed) {
    // Clients fall back to local intent heuristics when this is refused.
    const { resetAt } = dailyLimit.allowed ? shortTermLimit : dailyLimit;
    return Response.json(
      { code: "rate_limit:api", message: "Too many requests." },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": Math.max(
            Math.ceil((resetAt - Date.now()) / 1000),
            1
          ).toString(),
        },
      }
    );
  }

  let json: unknown;
  try { json = await readBoundedJson(request, 64*1024); }
  catch (error) { return error instanceof RequestBodyLimitError ? requestLimitResponse() : new ChatSDKError("bad_request:api").toResponse(); }
  const parsed = intentRequestSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { code: "bad_request:api", message: "Invalid intent request." },
      { status: 400 }
    );
  }

  const input: ImageIntentInput = parsed.data;
  const decision = shouldClassifyImageIntent(input)
    ? await classifyToolIntent(input)
    : { intent: "normal_chat" as const, webSearch: null };
  const intent = decision.intent;
  const durationMs = Math.round(performance.now() - startedAt);
  const decisionToken =
    intent === "image_generate" || intent === "image_edit"
      ? createImageIntentToken({
          intent,
          prompt: input.message,
          userId: session.user.id,
        })
      : createToolIntentToken({
          decision,
          prompt: input.message,
          userId: session.user.id,
        });

  return Response.json(
    { intent, decisionToken, webSearch: decision.webSearch },
    {
      headers: {
        "Cache-Control": "no-store",
        "Server-Timing": `tool-intent;dur=${durationMs}`,
      },
    }
  );
}
