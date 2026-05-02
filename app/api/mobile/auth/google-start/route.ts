import { NextResponse } from "next/server";
import { signIn } from "@/app/(auth)/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_ATTEMPT_ID_LENGTH = 80;

function noStore(response: NextResponse) {
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, max-age=0"
  );
  response.headers.set("Pragma", "no-cache");
  return response;
}

function normalizeAttemptId(value: string | null) {
  const normalized = value
    ?.replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, MAX_ATTEMPT_ID_LENGTH);
  return normalized || `web_${Date.now().toString(36)}`;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const attemptId = normalizeAttemptId(requestUrl.searchParams.get("attempt"));
  const callbackUrl = new URL(
    "/api/mobile/auth/oauth-complete",
    requestUrl.origin
  );
  callbackUrl.searchParams.set("attempt", attemptId);

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
    return noStore(NextResponse.redirect(redirectUrl));
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
