import { type NextRequest, NextResponse } from "next/server";
import { getUnreadContactMessageCounts } from "@/lib/db/queries";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { headers: { "Cache-Control": "no-store" }, status: 403 });
  }

  const { allowed, resetAt } = await incrementRateLimit(
    `admin-contact-unread:${admin.id}:${getClientKeyFromHeaders(request.headers)}`,
    { limit: 120, windowMs: 60_000 }
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

  try {
    return NextResponse.json(await getUnreadContactMessageCounts(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[admin.contacts] Failed to load unread counts.", error);
    return NextResponse.json(
      { error: "Unable to load unread counts" },
      { headers: { "Cache-Control": "no-store" }, status: 500 }
    );
  }
}
