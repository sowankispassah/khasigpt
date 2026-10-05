import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { AuthLookupUnavailableError } from "@/lib/api/auth";
import { createAuditLogEntry } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { getClientInfoFromHeaders } from "@/lib/security/client-info";
import { performPasswordChange } from "@/lib/security/password-change";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(request: Request) {
  let session: Awaited<ReturnType<typeof getMobileSession>>;
  try {
    session = await getMobileSession(request);
  } catch (error) {
    if (error instanceof AuthLookupUnavailableError) return NextResponse.json({ code: "error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    throw error;
  }
  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const result = await performPasswordChange(session.user.id, session.user.sessionVersion ?? 0, await request.json().catch(() => null));
  if (!result.ok) return NextResponse.json(result, { status: result.status, headers: { "Cache-Control": "no-store" } });

  const clientInfo = await getClientInfoFromHeaders();
  void withTimeout(createAuditLogEntry({
    actorId: session.user.id,
    action: "user.profile.password.update",
    target: { userId: session.user.id },
    subjectUserId: session.user.id,
    ...clientInfo,
  }), 1500).catch(() => console.warn("[auth.password] Audit unavailable."));

  revalidatePath("/profile");

  return NextResponse.json({ ok: true, signInRequired: true }, { headers: { "Cache-Control": "no-store" } });
}
