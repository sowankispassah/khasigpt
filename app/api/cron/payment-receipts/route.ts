import { NextResponse } from "next/server";
import { deliverPendingReceiptEmails } from "@/lib/payments/receipts";

export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const headers = { "Cache-Control": "no-store" };
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    const result = await deliverPendingReceiptEmails();
    return NextResponse.json(result, { headers });
  } catch {
    console.error("[receipts] Retry job failed");
    return NextResponse.json({ error: "Receipt retry unavailable" }, { status: 503, headers });
  }
}
