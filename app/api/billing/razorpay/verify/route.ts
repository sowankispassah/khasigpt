import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import {
  createUserSubscription,
  getPaymentTransactionByOrderId,
  getUserBalanceSummary,
  markPaymentTransactionFailed,
  markPaymentTransactionPaid,
  markPaymentTransactionProcessing,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import {
  getRazorpayClient,
  verifyPaymentSignature,
} from "@/lib/payments/razorpay";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const body = await request.json().catch(() => null);
  const orderId = body?.orderId as string | undefined;
  const paymentId = body?.paymentId as string | undefined;
  const signature = body?.signature as string | undefined;

  if (!orderId || !paymentId || !signature) {
    return new ChatSDKError(
      "bad_request:api",
      "Razorpay payment confirmation details are required."
    ).toResponse();
  }

  const transaction = await getPaymentTransactionByOrderId({ orderId });

  if (!transaction) {
    return new ChatSDKError(
      "not_found:api",
      "Payment transaction not found."
    ).toResponse();
  }

  if (transaction.userId !== session.user.id) {
    return new ChatSDKError("forbidden:api").toResponse();
  }

  if (transaction.status === "paid") {
    const balance = await getUserBalanceSummary(session.user.id);
    return NextResponse.json({
      ok: true,
      alreadyProcessed: true,
      balance,
    });
  }

  if (!verifyPaymentSignature({ orderId, paymentId, signature })) {
    return new ChatSDKError(
      "bad_request:api",
      "Invalid payment signature."
    ).toResponse();
  }

  const razorpay = getRazorpayClient();
  const order = await razorpay.orders.fetch(orderId);

  if (order.amount !== transaction.amount || order.currency !== transaction.currency) {
    await markPaymentTransactionFailed({ orderId });
    return new ChatSDKError(
      "bad_request:api",
      "Payment details do not match the expected order."
    ).toResponse();
  }

  if (order.status !== "paid") {
    return new ChatSDKError(
      "bad_request:api",
      "Payment is not completed yet."
    ).toResponse();
  }

  const locked = await markPaymentTransactionProcessing({
    orderId,
    userId: session.user.id,
  });

  if (!locked) {
    return new ChatSDKError(
      "bad_request:api",
      "Payment is being processed. Please try again in a few moments."
    ).toResponse();
  }

  try {
    await createUserSubscription({
      userId: session.user.id,
      planId: transaction.planId,
    });

    await markPaymentTransactionPaid({
      orderId,
      paymentId,
      signature,
    });

    const balance = await getUserBalanceSummary(session.user.id);

    return NextResponse.json({
      ok: true,
      balance,
    });
  } catch (error) {
    await markPaymentTransactionFailed({ orderId });

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error("Failed to finalize Razorpay payment", error);
    return new ChatSDKError("bad_request:api").toResponse();
  }
}
