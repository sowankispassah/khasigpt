import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listContactReplies, sendContactReply } from "@/lib/db/contact-replies";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };
const bodySchema = z.object({
  id: z.string().uuid(),
  requestId: z.string().uuid(),
  body: z.string().trim().min(1).max(10000),
});

export async function GET(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const id = z.string().uuid().safeParse(request.nextUrl.searchParams.get("id"));
  if (!id.success) return NextResponse.json({ error: "Invalid contact ID" }, { status: 400, headers: noStore });
  try {
    const replies = await listContactReplies(id.data);
    if (!replies) return NextResponse.json({ error: "Contact not found" }, { status: 404, headers: noStore });
    return NextResponse.json({ replies }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Unable to load replies" }, { status: 500, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const { allowed, resetAt } = await incrementRateLimit(
    `admin-contact-reply:${admin.id}:${getClientKeyFromHeaders(request.headers)}`,
    { limit: 20, windowMs: 60_000 }
  );
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, {
    status: 429, headers: { ...noStore, "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))) },
  });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid reply" }, { status: 400, headers: noStore });
  try {
    const result = await sendContactReply({
      messageId: parsed.data.id,
      requestId: parsed.data.requestId,
      actorUserId: admin.id,
      body: parsed.data.body,
    });
    if (!result) return NextResponse.json({ error: "Contact not found" }, { status: 404, headers: noStore });
    if (result.deliveryStatus === "invalid_recipient") return NextResponse.json({ error: "Invalid recipient email" }, { status: 422, headers: noStore });
    if (result.deliveryStatus === "invalid_request") return NextResponse.json({ error: "Reply request ID already used" }, { status: 409, headers: noStore });
    return NextResponse.json(result, { status: result.deliveryStatus === "sent" ? 200 : 202, headers: noStore });
  } catch {
    return NextResponse.json({ error: "Unable to confirm reply delivery" }, { status: 500, headers: noStore });
  }
}
