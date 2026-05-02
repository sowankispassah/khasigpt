import { NextResponse } from "next/server";
import { createMobileGoogleOAuthState } from "@/lib/mobile-google-oauth-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function noStoreRedirect(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, max-age=0"
  );
  response.headers.set("Pragma", "no-cache");
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Google sign in is not configured." },
      { status: 503 }
    );
  }

  const origin = requestUrl.origin;
  const redirectUri = `${origin}/api/mobile/auth/google-callback`;
  const { attemptId, state } = createMobileGoogleOAuthState(
    requestUrl.searchParams.get("attempt")
  );
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  console.info("[mobile-google-oauth] Start.", {
    attemptId,
    clientIdSuffix: clientId.slice(-12),
    origin,
    redirectUri,
  });

  return noStoreRedirect(url);
}
