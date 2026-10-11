import { NextResponse } from "next/server";
import { consumeMobileOAuthHandoff } from "@/lib/db/auth-queries";
import {
  createMobileAuthToken,
  verifyMobileOAuthHandoffToken,
} from "@/lib/mobile-auth-token";
import { MOBILE_GOOGLE_AUTH_ATTEMPT_COOKIE } from "@/lib/mobile-google-auth";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    httpOnly: true, maxAge: 0, path: "/", sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const handoff = requestUrl.searchParams.get("handoff");
  const payload = handoff ? verifyMobileOAuthHandoffToken(handoff) : null;

  if (!handoff || !payload) {
    return redirectToApp({ error: "oauth_handoff_expired" });
  }

  let consumed: boolean;
  try {
    consumed = await withTimeout(consumeMobileOAuthHandoff({ token: handoff, ...payload }), 2500);
  } catch {
    // Never mint a token when global consumption cannot be confirmed. A timed
    // out write may have committed: the user must restart Google sign-in.
    console.warn("[mobile-google-oauth] Handoff consumption unavailable.");
    return redirectToApp({ error: "oauth_handoff_unavailable" });
  }
  if (!consumed) {
    return redirectToApp({ error: "oauth_handoff_expired" });
  }

  return redirectToApp({
    token: createMobileAuthToken(payload.userId, { persistent: true, sessionVersion: payload.sessionVersion }),
  });
}
