import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  createAuditLogEntry,
  createImpersonationToken,
  getUserById,
} from "@/lib/db/queries";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const targetUserId = typeof body?.userId === "string" ? body.userId : null;

  if (!targetUserId) {
    return NextResponse.json({ error: "invalid_user" }, { status: 400 });
  }

  const targetUser = await getUserById(targetUserId);
  if (!targetUser) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const tokenRecord = await createImpersonationToken({
    targetUserId,
    createdByAdminId: session.user.id,
  });

  await createAuditLogEntry({
    actorId: session.user.id,
    action: "user.impersonation.start",
    target: { userId: targetUserId },
    metadata: {
      tokenId: tokenRecord.id,
      expiresAt: tokenRecord.expiresAt,
    },
    subjectUserId: targetUserId,
  });

  const callbackUrl = "/";
  const signinUrl = new URL("/impersonate", request.url);
  signinUrl.searchParams.set("token", tokenRecord.token);
  signinUrl.searchParams.set("redirectTo", callbackUrl);

  return NextResponse.json({ url: signinUrl.toString() });
}
