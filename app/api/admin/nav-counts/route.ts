import { type NextRequest, NextResponse } from "next/server";
import { loadAdminNavCounts } from "@/lib/admin/nav-counts";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  }

  const { allowed, resetAt } = await incrementRateLimit(
    `admin-nav-counts:${admin.id}:${getClientKeyFromHeaders(request.headers)}`,
    { limit: 60, windowMs: 60_000 }
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        headers: {
          ...headers,
          "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))),
        },
        status: 429,
      }
    );
  }

  return NextResponse.json(await loadAdminNavCounts(admin.id), { headers });
}
