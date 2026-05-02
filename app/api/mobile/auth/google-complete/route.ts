import { NextResponse } from "next/server";
import {
  createMobileAuthToken,
  verifyMobileOAuthHandoffToken,
} from "@/lib/mobile-auth-token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function redirectToApp(params: Record<string, string>) {
  const url = new URL("khasigpt://oauth-complete");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const handoff = requestUrl.searchParams.get("handoff");
  const payload = handoff ? verifyMobileOAuthHandoffToken(handoff) : null;

  if (!payload) {
    return redirectToApp({ error: "oauth_handoff_expired" });
  }

  return redirectToApp({
    token: createMobileAuthToken(payload.userId, { persistent: true }),
  });
}
