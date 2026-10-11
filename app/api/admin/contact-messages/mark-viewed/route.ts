import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { markContactMessageViewed } from "@/lib/db/queries";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({ id: z.string().uuid() });

export async function POST(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { headers: { "Cache-Control": "no-store" }, status: 403 });
  }

  const { allowed, resetAt } = await incrementRateLimit(
    `admin-contact-mark-viewed:${admin.id}:${getClientKeyFromHeaders(request.headers)}`,
    { limit: 60, windowMs: 60_000 }
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        headers: { "Cache-Control": "no-store", "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))) },
        status: 429,
      }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message ID" }, { headers: { "Cache-Control": "no-store" }, status: 400 });
  }

  try {
    const updated = await markContactMessageViewed(parsed.data.id);
    return NextResponse.json(
      { updated: Boolean(updated), kind: updated?.kind ?? null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[admin.contacts] Failed to mark message viewed.", error);
    return NextResponse.json(
      { error: "Unable to mark message viewed" },
      { headers: { "Cache-Control": "no-store" }, status: 500 }
    );
  }
}
