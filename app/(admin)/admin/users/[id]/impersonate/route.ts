import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  createAuditLogEntry,
  createImpersonationToken,
  getUserById,
} from "@/lib/db/queries";
import { getClientInfoFromHeaders } from "@/lib/security/client-info";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.redirect(new URL("/login", _request.url));
  }

  const targetUserId = id;
  const targetUser = await getUserById(targetUserId);
  if (!targetUser) {
    return NextResponse.redirect(new URL("/admin/users", _request.url));
  }

  const tokenRecord = await createImpersonationToken({
    targetUserId,
    createdByAdminId: session.user.id,
  });
  const clientInfo = await getClientInfoFromHeaders();
  const adminName =
    [session.user.firstName, session.user.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    session.user.name?.trim() ||
    null;

  await createAuditLogEntry({
    actorId: session.user.id,
    action: "user.impersonation.start",
    target: { userId: targetUserId },
    metadata: {
      tokenId: tokenRecord.id,
      expiresAt: tokenRecord.expiresAt,
      adminEmail: session.user.email ?? null,
      adminName,
    },
    subjectUserId: targetUserId,
    ...clientInfo,
  });

  const redirectUrl = new URL("/auth/impersonate", _request.url);
  redirectUrl.searchParams.set("token", tokenRecord.token);
  redirectUrl.searchParams.set("redirectTo", "/");

  return NextResponse.redirect(redirectUrl.toString());
}
