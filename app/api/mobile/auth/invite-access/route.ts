import { NextResponse } from "next/server";
import {
  hasActivePrelaunchInviteAccessForUser,
  redeemPrelaunchInviteTokenForUser,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getMobileSession } from "@/lib/mobile-auth-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getMobileSession(request);
  if (!session?.user) {
    return NextResponse.json(
      { authenticated: false, hasAccess: false },
      { headers: { "Cache-Control": "no-store" }, status: 401 }
    );
  }

  const hasAccess =
    session.user.role === "admin" ||
    (await hasActivePrelaunchInviteAccessForUser(session.user.id));
  return NextResponse.json(
    { authenticated: true, hasAccess },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const session = await getMobileSession(request);
  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) {
    return new ChatSDKError("bad_request:api", "Invite token is required.").toResponse();
  }

  if (session.user.role === "admin") {
    return NextResponse.json({ hasAccess: true, status: "already_granted" });
  }

  const redemption = await redeemPrelaunchInviteTokenForUser({
    token,
    userId: session.user.id,
  });
  if (
    redemption.status !== "redeemed" &&
    redemption.status !== "already_granted"
  ) {
    return NextResponse.json(
      {
        code: "invite_access_denied",
        hasAccess: false,
        message: "This invite link is invalid, expired, assigned elsewhere, or no longer active.",
        status: redemption.status,
      },
      { status: 403 }
    );
  }

  return NextResponse.json({ hasAccess: true, status: redemption.status });
}
