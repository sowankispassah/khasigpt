import { NextResponse } from "next/server";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { withTimeout } from "@/lib/utils/async";
import { receiptFilename } from "./receipt-data";
import { createReceiptPdf } from "./receipt-pdf";
import { getOwnedReceipt } from "./receipts";

export async function receiptResponse(orderId: string, ownerId: string, requesterId: string) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(orderId)) return NextResponse.json({ error: "Invalid order" }, { status: 400, headers });
  const limit = await incrementRateLimit(`receipt:${requesterId}`, { limit: 20, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Please retry shortly" }, { status: 429, headers });
  try {
    const receipt = await withTimeout(getOwnedReceipt(orderId, ownerId), 15_000);
    if (!receipt) return NextResponse.json({ error: "Receipt unavailable" }, { status: 404, headers });
    const pdf = await createReceiptPdf(receipt);
    return new Response(new Uint8Array(pdf), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${receiptFilename(receipt)}"` } });
  } catch {
    console.error("[receipts] Download failed", { orderId });
    return NextResponse.json({ error: "Receipt temporarily unavailable" }, { status: 503, headers });
  }
}
