import { NextResponse } from "next/server";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { receiptResponse } from "@/lib/payments/receipt-response";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const session = await getMobileSession(request);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return receiptResponse((await context.params).orderId, session.user.id, session.user.id);
}
