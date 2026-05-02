import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { createMobileAuthToken } from "@/lib/mobile-auth-token";

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
  const attemptId = requestUrl.searchParams.get("attempt") ?? "unknown";
  const session = await auth();

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
