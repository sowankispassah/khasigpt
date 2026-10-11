import { timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { deliverPendingReceiptEmails } from "@/lib/payments/receipts";
import { runChatStorageMaintenance } from "@/lib/uploads/storage-maintenance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  const supplied = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  if (!secret || Buffer.byteLength(secret) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  if (!dryRun) after(async () => { await deliverPendingReceiptEmails().catch(() => { console.error("[receipts] Daily email retry failed"); }); });
  try {
    return NextResponse.json(await runChatStorageMaintenance({ dryRun }), { headers });
  } catch {
    console.error("[chat-storage] Maintenance failed; no unchecked files are deleted.");
    return NextResponse.json({ error: "Storage maintenance unavailable" }, { status: 503, headers });
  }
}
