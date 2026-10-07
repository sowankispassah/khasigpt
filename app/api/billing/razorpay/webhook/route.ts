import { after, NextResponse } from "next/server";
import {
  completePaymentTransactionWithSubscription,
  getPaymentTransactionByOrderId,
  markPaymentTransactionFailed,
  markPaymentTransactionProcessing,
  recordCouponRedemptionFromTransaction,
} from "@/lib/db/queries";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";
import { parseRazorpayPaymentEvent } from "@/lib/payments/razorpay-webhook";
import { deliverReceiptEmail } from "@/lib/payments/receipts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 256 * 1024;
// A checkout /verify call that died mid-way leaves the order "processing";
// after this long the webhook may take it over.
const PROCESSING_STALE_MS = 5 * 60 * 1000;

function respond(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Server-to-server confirmation from Razorpay. Credits the order even when the
 * buyer's browser never reaches /api/billing/razorpay/verify (closed tab, lost
 * network). Both paths share the same processing lock, so an order is credited
 * once. Non-2xx responses make Razorpay retry the delivery.
 */
export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET is not configured.");
    return respond(503, { ok: false });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return respond(413, { ok: false });
  }
  const body = await request.text();
  if (body.length > MAX_BODY_BYTES) {
    return respond(413, { ok: false });
  }

  if (
    !verifyWebhookSignature({
      body,
      secret,
      signature: request.headers.get("x-razorpay-signature"),
    })
  ) {
    return respond(401, { ok: false });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return respond(400, { ok: false });
  }

  const event = parseRazorpayPaymentEvent(parsed);
  if (!event) {
    return respond(200, { ok: true, ignored: true });
  }

  const { orderId } = event;
  const transaction = await getPaymentTransactionByOrderId({ orderId });
  if (!transaction || transaction.provider !== "razorpay") {
    // Orders created outside this app need no action here.
    return respond(200, { ok: true, ignored: true });
  }
  if (transaction.status === "paid") {
    return respond(200, { ok: true, alreadyProcessed: true });
  }
  if (
    event.amount !== transaction.amount ||
    event.currency !== transaction.currency
  ) {
    console.error("[razorpay-webhook] Payment does not match the expected order.", {
      event: event.event,
      orderId,
    });
    return respond(200, { ok: false, ignored: true });
  }

  const locked = await markPaymentTransactionProcessing({
    orderId,
    processingStaleBefore: new Date(Date.now() - PROCESSING_STALE_MS),
    retryFailed: true,
    userId: transaction.userId,
  });
  if (!locked) {
    // The checkout verify call holds the lock; retry later to confirm.
    return respond(409, { ok: false, processing: true });
  }

  try {
    const completed = await completePaymentTransactionWithSubscription({
      orderId,
      paymentId: event.paymentId,
      planId: transaction.planId,
      signature: `webhook:${event.event}`,
      userId: transaction.userId,
    });
    if (!completed.alreadyProcessed) {
      await recordCouponRedemptionFromTransaction(transaction);
    }
    after(async () => {
      await deliverReceiptEmail(orderId).catch(() => {
        console.error("[receipts] Delivery scheduling failed", { orderId });
      });
    });
    return respond(200, { ok: true });
  } catch {
    await markPaymentTransactionFailed({ orderId }).catch(() => undefined);
    console.error("[razorpay-webhook] Failed to complete payment.", { orderId });
    return respond(500, { ok: false });
  }
}
