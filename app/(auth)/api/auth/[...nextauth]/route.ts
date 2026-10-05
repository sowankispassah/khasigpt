import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { GET as authGET, POST as authPOST } from "@/app/(auth)/auth";
import { MOBILE_GOOGLE_AUTH_ATTEMPT_COOKIE } from "@/lib/mobile-google-auth";
import { sanitizeRedirectPath } from "@/lib/security/safe-redirect";

const CALLBACK_CODE_TTL_MS = 60 * 1000;
const CALLBACK_CODE_COOKIE = "__auth_callback_code";
const recentCallbackCodes = new Map<string, number>();

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
    // The browser's Auth.js flow owns its callback destination. A leftover
    // direct-mobile attempt is not evidence that this web login is native.
    const callbackParam = url.searchParams.get("callbackUrl") ??
      cookieStore.get("__Secure-authjs.callback-url")?.value ??
      cookieStore.get("authjs.callback-url")?.value ?? "/";
    const safeCallback = sanitizeRedirectPath(callbackParam, url.origin, "/");
    const storedCode = cookieStore.get(CALLBACK_CODE_COOKIE)?.value;
    if (storedCode && storedCode === code) {
      return NextResponse.redirect(new URL(safeCallback, url.origin));
    }

    const seenAt = recentCallbackCodes.get(code);
    if (typeof seenAt === "number" && now - seenAt < CALLBACK_CODE_TTL_MS) {
      return NextResponse.redirect(new URL(safeCallback, url.origin));
    }

    const response = await authGET(request as NextRequest);
    recentCallbackCodes.set(code, now);
    const nextResponse = new NextResponse(response.body, response);
    nextResponse.cookies.set(MOBILE_GOOGLE_AUTH_ATTEMPT_COOKIE, "", {
      httpOnly: true, maxAge: 0, path: "/", sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
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
