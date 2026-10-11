import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { photoCacheDurationSchema } from "@/lib/explore/photo-cache-policy";
import { readPhotoCachePolicy, updatePhotoCachePolicy } from "@/lib/explore/photo-cache-settings";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { incrementRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), successTtlSeconds: photoCacheDurationSchema }).strict(),
  z.object({ action: z.literal("reset") }).strict(),
]);
export async function GET(request: NextRequest) {
  if (!await requireAdminApiUser(request)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  try { return NextResponse.json({ photoCache: await readPhotoCachePolicy() }, { headers }); }
  catch { return NextResponse.json({ error: "unavailable" }, { status: 503, headers }); }
}
export async function POST(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400, headers });
  try {
    const limit = await incrementRateLimit(`explore-photo-cache-admin:${admin.id}`, { limit: 10, windowMs: 60_000 });
    if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers });
    const photoCache = await updatePhotoCachePolicy(parsed.data.action === "reset" ? { reset: true } : { successTtlSeconds: parsed.data.successTtlSeconds });
    console.info("[admin/explore/photo-cache] updated", { actorId: admin.id, action: parsed.data.action });
    return NextResponse.json({ photoCache }, { headers });
  } catch { return NextResponse.json({ error: "save_failed" }, { status: 503, headers }); }
}
