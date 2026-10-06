import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { receiptResponse } from "@/lib/payments/receipt-response";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return receiptResponse((await context.params).orderId, session.user.id, session.user.id);
}
