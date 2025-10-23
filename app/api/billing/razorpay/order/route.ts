import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import {
  createPaymentTransaction,
  getPricingPlanById,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import {
  getRazorpayClient,
  getRazorpayKeyId,
} from "@/lib/payments/razorpay";

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:api").toResponse();
    }

    const body = await request.json().catch(() => null);
    const planId = body?.planId as string | undefined;

    if (!planId) {
      return new ChatSDKError(
        "bad_request:api",
        "Pricing plan id is required."
      ).toResponse();
    }

    const plan = await getPricingPlanById({ id: planId });

    if (!plan) {
      return new ChatSDKError(
        "not_found:api",
        "Pricing plan not found."
      ).toResponse();
    }

    const razorpay = getRazorpayClient();
    const order = await razorpay.orders.create({
      amount: plan.priceInPaise,
      currency: "INR",
      receipt: `recharge-${Date.now()}`,
      notes: {
        planId: plan.id,
        userId: session.user.id,
      },
    });

    await createPaymentTransaction({
      userId: session.user.id,
      planId: plan.id,
      orderId: order.id,
      amount: Number(order.amount),
      currency: order.currency,
      notes: (order.notes ?? null) as Record<string, unknown> | null,
    });

    return NextResponse.json({
      key: getRazorpayKeyId(),
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      plan: {
        id: plan.id,
        name: plan.name,
        description: plan.description,
      },
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error("Failed to create Razorpay order", error);
    return new ChatSDKError("bad_request:api").toResponse();
  }
}
