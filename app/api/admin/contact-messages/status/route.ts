import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toContactTableMessage } from "@/lib/admin/contact-table-message";
import { changeMessageStatus, listMessageStatusEvents } from "@/lib/db/report-workflow";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const noStore = { "Cache-Control": "no-store" };
const bodySchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "in_progress", "resolved", "archived"]),
  note: z.string().trim().max(2000).optional(),
});

export async function GET(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const id = z.string().uuid().safeParse(request.nextUrl.searchParams.get("id"));
  if (!id.success) return NextResponse.json({ error: "Invalid contact ID" }, { status: 400, headers: noStore });
  try {
    const events = await listMessageStatusEvents(id.data, "contact");
    if (!events) return NextResponse.json({ error: "Contact not found" }, { status: 404, headers: noStore });
    return NextResponse.json({ events }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Unable to load contact history" }, { status: 500, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const { allowed, resetAt } = await incrementRateLimit(
    `admin-contact-status:${admin.id}:${getClientKeyFromHeaders(request.headers)}`,
    { limit: 30, windowMs: 60_000 }
  );
  if (!allowed) return NextResponse.json({ error: "Too many requests" }, {
    status: 429, headers: { ...noStore, "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))) },
  });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid contact action" }, { status: 400, headers: noStore });
  try {
    const result = await changeMessageStatus({
      messageId: parsed.data.id,
      kind: "contact",
      actorUserId: admin.id,
      status: parsed.data.status,
      note: parsed.data.note || null,
    });
    if (!result) return NextResponse.json({ error: "Contact not found" }, { status: 404, headers: noStore });
    if (result.unchanged) return NextResponse.json({ error: "Status is already selected" }, { status: 409, headers: noStore });
    return NextResponse.json({ contact: toContactTableMessage(result.message) }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Unable to update contact" }, { status: 500, headers: noStore });
  }
}
