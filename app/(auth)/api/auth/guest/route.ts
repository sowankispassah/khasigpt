import { NextResponse } from "next/server";
import { auth, signIn } from "@/app/(auth)/auth";
import { ChatSDKError } from "@/lib/errors";
import { GUEST_SIGNIN_RATE_LIMIT, isGuestLoginEnabled } from "@/lib/security/guest-login";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";
import { sanitizeRedirectPath } from "@/lib/security/safe-redirect";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const redirectUrl = sanitizeRedirectPath(
    searchParams.get("redirectUrl"),
    new URL(request.url).origin,
    "/chat"
  );

  if (!isGuestLoginEnabled()) {
    return new ChatSDKError(
      "forbidden:auth",
      "Guest login is disabled in production. Ask an admin to enable ENABLE_GUEST_LOGIN if this should be available."
    ).toResponse();
  }

  const clientKey = getClientKeyFromHeaders(request.headers);
  const { allowed, resetAt } = await incrementRateLimit(
    // Entry throttling protects the session lookup; the provider separately
    // enforces guest creation across both this route and direct callbacks.
    `guest-entry:${clientKey}`,
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
    return NextResponse.redirect(new URL(redirectUrl, request.url));
  }

  return signIn("guest", { redirect: true, redirectTo: redirectUrl });
}
