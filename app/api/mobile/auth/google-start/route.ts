import { NextResponse } from "next/server";
import {
  MOBILE_GOOGLE_AUTH_ATTEMPT_COOKIE,
  MOBILE_GOOGLE_AUTH_ATTEMPT_MAX_AGE_SECONDS,
  normalizeMobileGoogleAttemptId,
} from "@/lib/mobile-google-auth";
import { createMobileGoogleOAuthState } from "@/lib/mobile-google-oauth-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStore(response: NextResponse) {
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, max-age=0"
  );
  response.headers.set("Pragma", "no-cache");
  return response;
}

function redirectToApp(params: Record<string, string>) {
  const url = new URL("khasigpt://oauth-complete");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return noStore(NextResponse.redirect(url));
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const attemptId = normalizeMobileGoogleAttemptId(
    requestUrl.searchParams.get("attempt")
  );
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    console.error("[mobile-google-oauth] Missing Google client id.", {
      attemptId,
      origin: requestUrl.origin,
    });
    return redirectToApp({ attempt: attemptId, error: "google_not_configured" });
  }

  const { state } = createMobileGoogleOAuthState(attemptId);
  const redirectUri = `${requestUrl.origin}/api/mobile/auth/google-callback`;
  const googleUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleUrl.searchParams.set("client_id", clientId);
  googleUrl.searchParams.set("redirect_uri", redirectUri);
  googleUrl.searchParams.set("response_type", "code");
  googleUrl.searchParams.set("scope", "openid email profile");
  googleUrl.searchParams.set("state", state);
  googleUrl.searchParams.set("prompt", "select_account");

  console.info("[mobile-google-oauth] Starting direct mobile OAuth.", {
    attemptId,
    clientIdSuffix: clientId.slice(-12),
    origin: requestUrl.origin,
    provider: "google",
    redirectUri,
  });

  const response = noStore(NextResponse.redirect(googleUrl));
  response.cookies.set(MOBILE_GOOGLE_AUTH_ATTEMPT_COOKIE, attemptId, {
    httpOnly: true,
    maxAge: MOBILE_GOOGLE_AUTH_ATTEMPT_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
