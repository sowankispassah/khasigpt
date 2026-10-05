import { NextResponse } from "next/server";
import { getAuthUserRoleById } from "@/lib/db/auth-queries";
import {
  createMobileAuthToken,
  verifyMobileOAuthHandoffToken,
} from "@/lib/mobile-auth-token";
import { hasCurrentSessionVersion } from "@/lib/security/session-version";
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
  return response;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const handoff = requestUrl.searchParams.get("handoff");
  const payload = handoff ? verifyMobileOAuthHandoffToken(handoff) : null;

  if (!payload) {
    return redirectToApp({ error: "oauth_handoff_expired" });
  }

  const user = await withTimeout(getAuthUserRoleById(payload.userId), 2500).catch(() => null);
  if (!user?.isActive || !hasCurrentSessionVersion(payload.sessionVersion, user.sessionVersion)) {
    return redirectToApp({ error: "oauth_handoff_expired" });
  }

  return redirectToApp({
    token: createMobileAuthToken(payload.userId, { persistent: true, sessionVersion: payload.sessionVersion }),
  });
}
