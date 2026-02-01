import { GET as authGET, POST as authPOST } from "@/app/(auth)/auth";
import { sanitizeRedirectPath } from "@/lib/security/safe-redirect";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

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
    const storedCode = cookieStore.get(CALLBACK_CODE_COOKIE)?.value;
    if (storedCode && storedCode === code) {
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
      const callbackParam = url.searchParams.get("callbackUrl") ?? "/";
      const safeCallback = sanitizeRedirectPath(
        callbackParam,
        url.origin,
        "/"
      );
      return NextResponse.redirect(new URL(safeCallback, url.origin));
    }

    const response = await authGET(request);
    recentCallbackCodes.set(code, now);
    const nextResponse = new NextResponse(response.body, response);
    nextResponse.cookies.set(CALLBACK_CODE_COOKIE, code, {
      httpOnly: true,
      maxAge: Math.ceil(CALLBACK_CODE_TTL_MS / 1000),
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return nextResponse;
  }

  return authGET(request);
}

export async function POST(request: Request) {
  return authPOST(request);
}
