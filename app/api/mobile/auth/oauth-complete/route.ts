import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { auth } from "@/app/(auth)/auth";
import { withApiTiming } from "@/lib/api/observability";
import { createMobileAuthToken } from "@/lib/mobile-auth-token";
import { MOBILE_GOOGLE_AUTH_ATTEMPT_COOKIE } from "@/lib/mobile-google-auth";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AUTH_SESSION_FALLBACK_TIMEOUT_MS = 2500;

function redirectToApp(params: Record<string, string>) {
  const url = new URL("khasigpt://oauth-complete");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = NextResponse.redirect(url);
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, max-age=0"
  );
  response.headers.set("Pragma", "no-cache");
  response.cookies.set(MOBILE_GOOGLE_AUTH_ATTEMPT_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const attemptId = requestUrl.searchParams.get("attempt") ?? "unknown";
  const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  const token = authSecret
    ? await withApiTiming(
        "mobile.google.oauth_complete.jwt",
        () => getToken({ req: request as any, secret: authSecret }),
        {
          metadata: { attemptId },
          slowMs: 500,
        }
      ).catch((error) => {
        console.error("[mobile-google-oauth] Failed to decode handoff token.", {
          attemptId,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      })
    : null;
  const tokenUserId = typeof token?.id === "string" ? token.id : null;

  if (tokenUserId) {
    console.info("[mobile-google-oauth] Auth.js handoff token decoded.", {
      attemptId,
      userId: tokenUserId,
      role: typeof token?.role === "string" ? token.role : "unknown",
    });

    return redirectToApp({
      attempt: attemptId,
      token: createMobileAuthToken(tokenUserId, { persistent: true }),
    });
  }

  const session = await withApiTiming(
    "mobile.google.oauth_complete.session_fallback",
    () =>
      withTimeout(auth(), AUTH_SESSION_FALLBACK_TIMEOUT_MS, () => {
        console.warn(
          "[mobile-google-oauth] Auth.js session fallback timed out.",
          { attemptId }
        );
      }),
    {
      metadata: { attemptId },
      slowMs: 500,
    }
  ).catch((error) => {
    console.error("[mobile-google-oauth] Auth.js handoff session failed.", {
      attemptId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  if (!session?.user?.id) {
    console.error("[mobile-google-oauth] Auth.js handoff missing session.", {
      attemptId,
    });
    return redirectToApp({ attempt: attemptId, error: "unauthorized" });
  }

  console.info("[mobile-google-oauth] Auth.js handoff completed.", {
    attemptId,
    userId: session.user.id,
  });

  return redirectToApp({
    attempt: attemptId,
    token: createMobileAuthToken(session.user.id, { persistent: true }),
  });
}
