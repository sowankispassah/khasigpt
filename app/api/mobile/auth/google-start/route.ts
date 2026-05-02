import { NextResponse } from "next/server";
import { signIn } from "@/app/(auth)/auth";
import {
  createMobileGoogleCompletionUrl,
  MOBILE_GOOGLE_AUTH_ATTEMPT_COOKIE,
  MOBILE_GOOGLE_AUTH_ATTEMPT_MAX_AGE_SECONDS,
  normalizeMobileGoogleAttemptId,
} from "@/lib/mobile-google-auth";

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

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const attemptId = normalizeMobileGoogleAttemptId(
    requestUrl.searchParams.get("attempt")
  );
  const callbackUrl = createMobileGoogleCompletionUrl(
    requestUrl.origin,
    attemptId
  );

  console.info("[mobile-google-oauth] Starting Auth.js handoff.", {
    attemptId,
    callbackUrl: callbackUrl.toString(),
    clientIdSuffix: process.env.GOOGLE_CLIENT_ID?.slice(-12) ?? "missing",
    origin: requestUrl.origin,
    provider: "authjs-google",
  });

  try {
    const redirectUrl = await signIn(
      "google",
      {
        redirect: false,
        redirectTo: callbackUrl.toString(),
      },
      {
        prompt: "select_account",
      }
    );
    const response = noStore(NextResponse.redirect(redirectUrl));
    response.cookies.set(MOBILE_GOOGLE_AUTH_ATTEMPT_COOKIE, attemptId, {
      httpOnly: true,
      maxAge: MOBILE_GOOGLE_AUTH_ATTEMPT_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (error) {
    console.error("[mobile-google-oauth] Failed to start Auth.js handoff.", {
      attemptId,
      error: error instanceof Error ? error.message : String(error),
    });
    const url = new URL("khasigpt://oauth-complete");
    url.searchParams.set("attempt", attemptId);
    url.searchParams.set("error", "google_auth_start_failed");
    return noStore(NextResponse.redirect(url));
  }
}
