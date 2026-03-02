import { NextResponse } from "next/server";
import { auth, signIn } from "@/app/(auth)/auth";
import { ChatSDKError } from "@/lib/errors";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";
import { sanitizeRedirectPath } from "@/lib/security/safe-redirect";

const isProduction = process.env.NODE_ENV === "production";
const GUEST_SIGNIN_RATE_LIMIT = {
  limit: 10,
  windowMs: 10 * 60 * 1000,
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const redirectUrl = sanitizeRedirectPath(
    searchParams.get("redirectUrl"),
    new URL(request.url).origin
  );

  if (
    isProduction &&
    (process.env.ENABLE_GUEST_LOGIN ?? "false").toLowerCase() !== "true"
  ) {
    return new ChatSDKError(
      "forbidden:auth",
      "Guest login is disabled in production. Ask an admin to enable ENABLE_GUEST_LOGIN if this should be available."
    ).toResponse();
  }

  const clientKey = getClientKeyFromHeaders(request.headers);
  const { allowed, resetAt } = await incrementRateLimit(
    `guest:${clientKey}`,
    GUEST_SIGNIN_RATE_LIMIT
  );

  if (!allowed) {
    const retryAfter = Math.max(
      Math.ceil((resetAt - Date.now()) / 1000),
      1
    ).toString();
    return NextResponse.json(
      {
        code: "rate_limit:auth",
        message: "Too many guest sign-ins. Please try again later.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfter,
        },
      }
    );
  }

  const session = await auth();

  if (session) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return signIn("guest", { redirect: true, redirectTo: redirectUrl });
}
