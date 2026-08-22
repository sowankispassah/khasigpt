import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  PRELAUNCH_INVITE_COOKIE_MAX_AGE_SECONDS,
  PRELAUNCH_INVITE_COOKIE_NAME,
} from "@/lib/constants";
import {
  getPrelaunchInviteTokenStatus,
  redeemPrelaunchInviteTokenForUser,
} from "@/lib/db/queries";
import { sanitizeRedirectPath } from "@/lib/security/safe-redirect";

export const runtime = "nodejs";

const DEFAULT_CALLBACK_PATH = "/chat";
const COMING_SOON_PATH = "/coming-soon";
const LOGIN_PATH = "/login";

export async function GET(
  request: Request,
  { params }: { params: { token: string } }
) {
  const url = new URL(request.url);
  const token = params.token?.trim() ?? "";
  const callbackParam = url.searchParams.get("callbackUrl") ?? DEFAULT_CALLBACK_PATH;
  const safeCallbackPath = sanitizeRedirectPath(
    callbackParam,
    url.origin,
    DEFAULT_CALLBACK_PATH
  );

  if (!token) {
    return NextResponse.redirect(new URL(COMING_SOON_PATH, url.origin));
  }

  const inviteStatus = await getPrelaunchInviteTokenStatus(token);
  if (inviteStatus.status !== "valid") {
    return NextResponse.redirect(new URL(COMING_SOON_PATH, url.origin));
  }

  const session = await auth();
  if (session?.user?.id) {
    if (session.user.role === "admin") {
      return NextResponse.redirect(new URL(safeCallbackPath, url.origin));
    }

    const redemption = await redeemPrelaunchInviteTokenForUser({
      token,
      userId: session.user.id,
    });

    const redirectPath =
      redemption.status === "redeemed" || redemption.status === "already_granted"
        ? safeCallbackPath
        : COMING_SOON_PATH;
    const response = NextResponse.redirect(new URL(redirectPath, url.origin));
    response.cookies.set(PRELAUNCH_INVITE_COOKIE_NAME, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  }

  const loginUrl = new URL(LOGIN_PATH, url.origin);
  loginUrl.searchParams.set("callbackUrl", safeCallbackPath);

  const response = NextResponse.redirect(loginUrl);
  response.cookies.set(PRELAUNCH_INVITE_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: PRELAUNCH_INVITE_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
