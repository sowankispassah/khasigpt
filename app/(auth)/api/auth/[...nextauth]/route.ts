import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { GET as authGET, POST as authPOST } from "@/app/(auth)/auth";
import {
  createMobileGoogleCompletionUrl,
  MOBILE_GOOGLE_AUTH_ATTEMPT_COOKIE,
  normalizeMobileGoogleAttemptId,
} from "@/lib/mobile-google-auth";
import { sanitizeRedirectPath } from "@/lib/security/safe-redirect";

const CALLBACK_CODE_TTL_MS = 60 * 1000;
const CALLBACK_CODE_COOKIE = "__auth_callback_code";
const recentCallbackCodes = new Map<string, number>();

const getMobileGoogleAttemptId = (value: string | undefined) =>
  value ? normalizeMobileGoogleAttemptId(value) : null;

const forceMobileGoogleCompletion = (
  response: Response,
  completionUrl: URL
) => {
  const headers = new Headers(response.headers);
  headers.set("Location", completionUrl.toString());
  headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, max-age=0"
  );
  headers.set("Pragma", "no-cache");

  return new NextResponse(null, {
    headers,
    status:
      response.status >= 300 && response.status < 400 ? response.status : 307,
  });
};

const pruneCallbackCodes = (now: number) => {
  for (const [code, seenAt] of recentCallbackCodes) {
    if (now - seenAt > CALLBACK_CODE_TTL_MS) {
      recentCallbackCodes.delete(code);
    }
  }
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const isCallback = url.pathname.includes("/api/auth/callback/");
  const code = url.searchParams.get("code");

  if (isCallback && code) {
    const now = Date.now();
    pruneCallbackCodes(now);

    const cookieStore = await cookies();
    const mobileGoogleAttemptId = getMobileGoogleAttemptId(
      cookieStore.get(MOBILE_GOOGLE_AUTH_ATTEMPT_COOKIE)?.value
    );
    const storedCode = cookieStore.get(CALLBACK_CODE_COOKIE)?.value;
    if (storedCode && storedCode === code) {
      if (mobileGoogleAttemptId) {
        return NextResponse.redirect(
          createMobileGoogleCompletionUrl(url.origin, mobileGoogleAttemptId)
        );
      }
      const callbackParam = url.searchParams.get("callbackUrl") ?? "/";
      const safeCallback = sanitizeRedirectPath(
        callbackParam,
        url.origin,
        "/"
      );
      return NextResponse.redirect(new URL(safeCallback, url.origin));
    }

    const seenAt = recentCallbackCodes.get(code);
    if (typeof seenAt === "number" && now - seenAt < CALLBACK_CODE_TTL_MS) {
      if (mobileGoogleAttemptId) {
        return NextResponse.redirect(
          createMobileGoogleCompletionUrl(url.origin, mobileGoogleAttemptId)
        );
      }
      const callbackParam = url.searchParams.get("callbackUrl") ?? "/";
      const safeCallback = sanitizeRedirectPath(
        callbackParam,
        url.origin,
        "/"
      );
      return NextResponse.redirect(new URL(safeCallback, url.origin));
    }

    const response = await authGET(request as NextRequest);
    recentCallbackCodes.set(code, now);
    const nextResponse =
      mobileGoogleAttemptId && url.pathname.endsWith("/callback/google")
        ? forceMobileGoogleCompletion(
            response,
            createMobileGoogleCompletionUrl(url.origin, mobileGoogleAttemptId)
          )
        : new NextResponse(response.body, response);
    if (mobileGoogleAttemptId && url.pathname.endsWith("/callback/google")) {
      console.info(
        "[mobile-google-oauth] Forced Auth.js callback to native handoff.",
        {
          attemptId: mobileGoogleAttemptId,
          authStatus: response.status,
        }
      );
    }
    nextResponse.cookies.set(CALLBACK_CODE_COOKIE, code, {
      httpOnly: true,
      maxAge: Math.ceil(CALLBACK_CODE_TTL_MS / 1000),
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return nextResponse;
  }

  return authGET(request as NextRequest);
}

export async function POST(request: Request) {
  return authPOST(request as NextRequest);
}
