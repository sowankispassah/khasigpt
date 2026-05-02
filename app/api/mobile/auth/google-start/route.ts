import { NextResponse } from "next/server";
import { createMobileGoogleOAuthState } from "@/lib/mobile-google-oauth-state";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Google sign in is not configured." },
      { status: 503 }
    );
  }

  const origin = new URL(request.url).origin;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set(
    "redirect_uri",
    `${origin}/api/mobile/auth/google-callback`
  );
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", createMobileGoogleOAuthState());
  url.searchParams.set("prompt", "select_account");

  return NextResponse.redirect(url);
}
