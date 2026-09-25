import { type NextRequest, NextResponse } from "next/server";
import {
  createAuditLogEntry,
  createImpersonationToken,
  getUserById,
} from "@/lib/db/queries";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";

export async function POST(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
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
    createdByAdminId: admin.id,
  });

  await createAuditLogEntry({
    actorId: admin.id,
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
