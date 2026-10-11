import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLogEntry, updateUserLocation } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { getClientInfoFromHeaders } from "@/lib/security/client-info";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const schema = z.object({ accuracy: z.number().finite().nullable().optional(), latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180) });

export async function PATCH(request: Request) {
  const session = await getMobileSession(request);
  if (!session?.user) return new ChatSDKError("unauthorized:api").toResponse();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.at(0)?.message ?? "Invalid coordinates." }, { status: 400 });
  await updateUserLocation({ id: session.user.id, latitude: parsed.data.latitude, longitude: parsed.data.longitude, accuracy: parsed.data.accuracy ?? null, consent: true });
  const clientInfo = await getClientInfoFromHeaders();
  await createAuditLogEntry({ actorId: session.user.id, action: "user.location.update", target: { userId: session.user.id }, metadata: parsed.data, subjectUserId: session.user.id, ...clientInfo });
  return NextResponse.json({ ok: true, updatedAt: new Date().toISOString() });
}
