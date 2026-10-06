import { type NextRequest, NextResponse } from "next/server";
import { getStorageAlertCount } from "@/lib/admin/chat-storage";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { runChatStorageMaintenance } from "@/lib/uploads/storage-maintenance";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const headers = { "Cache-Control": "no-store" };
export async function GET(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  const limit = await incrementRateLimit(`admin-storage:${admin.id}`, { limit: 30, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Unavailable" }, { status: limit.reason === "unavailable" ? 503 : 429, headers });
  try { return NextResponse.json({ count: await getStorageAlertCount() }, { headers }); }
  catch { return NextResponse.json({ error: "Storage information unavailable" }, { status: 503, headers }); }
}

// Admin inspection always reconciles metadata without deleting or claiming
// files. A client-supplied body/query can never switch this into cleanup mode.
export async function POST(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin || request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  const limit = await incrementRateLimit(`admin-storage-inventory:${admin.id}`, { limit: 5, windowMs: 3600_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Unavailable" }, { status: limit.reason === "unavailable" ? 503 : 429, headers });
  try { return NextResponse.json(await runChatStorageMaintenance({ dryRun: true }), { headers }); }
  catch { return NextResponse.json({ error: "Storage inspection unavailable" }, { status: 503, headers }); }
}
