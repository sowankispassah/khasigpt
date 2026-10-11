import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { ChatSDKError } from "@/lib/errors";
import { incrementRateLimit } from "@/lib/security/rate-limit";

export function forumErrorResponse(error: unknown) {
  if (error instanceof ChatSDKError) {
    return error.toResponse();
  }

  if (error instanceof ZodError) {
    const details = error.flatten();
    return NextResponse.json(
      {
        code: "bad_request:api",
        message: "One or more fields are invalid.",
        details,
      },
      { status: 422 }
    );
  }

  console.error("[forum] API error", error);

  return NextResponse.json(
    {
      code: "bad_request:api",
      message:
        "Unable to process the request right now. Please try again later.",
    },
    { status: 500 }
  );
}

export function forumDisabledResponse() {
  return NextResponse.json(
    {
      code: "forum:disabled",
      message: "The community forum is currently unavailable.",
    },
    { status: 404 }
  );
}

// Per-user caps on forum writes so an open signup cannot flood threads,
// replies or reaction toggles. Returns a 429 response when over the cap.
const FORUM_WRITE_LIMITS = {
  thread: { limit: 5, windowMs: 60 * 60 * 1000 },
  reply: { limit: 10, windowMs: 10 * 60 * 1000 },
  reaction: { limit: 60, windowMs: 60 * 1000 },
} as const;

export async function forumWriteRateLimitResponse(
  userId: string,
  action: keyof typeof FORUM_WRITE_LIMITS
) {
  const { allowed } = await incrementRateLimit(
    `forum-${action}:${userId}`,
    FORUM_WRITE_LIMITS[action]
  );
  return allowed ? null : new ChatSDKError("rate_limit:forum").toResponse();
}
