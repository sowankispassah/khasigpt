import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/queries";
import { paymentTransaction } from "@/lib/db/schema";
import { receiptResponse } from "@/lib/payments/receipt-response";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ orderId: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  const admin = await requireAdminApiUser(request);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers });
  const { orderId } = await context.params;
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(orderId)) return NextResponse.json({ error: "Invalid order" }, { status: 400, headers });
  try {
    const [paid] = await withTimeout(db.select({ userId: paymentTransaction.userId }).from(paymentTransaction).where(and(eq(paymentTransaction.orderId, orderId), eq(paymentTransaction.status, "paid"))).limit(1), 4000);
    if (!paid) return NextResponse.json({ error: "Receipt unavailable" }, { status: 404, headers });
    return receiptResponse(orderId, paid.userId, admin.id);
  } catch {
    return NextResponse.json({ error: "Receipt temporarily unavailable" }, { status: 503, headers });
  }
}
