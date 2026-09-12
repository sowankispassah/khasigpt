import { NextResponse } from "next/server";
import { createAuditLogEntry, updateUserActiveState } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { getClientInfoFromHeaders } from "@/lib/security/client-info";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getMobileSession(request);
  if (!session?.user) return new ChatSDKError("unauthorized:api").toResponse();
  const updated = await updateUserActiveState({ id: session.user.id, isActive: false });
  if (!updated) return NextResponse.json({ error: "We could not deactivate your account. Please try again." }, { status: 503 });
  const clientInfo = await getClientInfoFromHeaders();
  await createAuditLogEntry({ actorId: session.user.id, action: "user.account.deactivate", target: { userId: session.user.id }, subjectUserId: session.user.id, metadata: { client: "native" }, ...clientInfo });
  return NextResponse.json({ ok: true });
}
