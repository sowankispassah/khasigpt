import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import {
  createPaymentTransaction,
  getCouponByCode,
  getPricingPlanById,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getRazorpayClient, getRazorpayKeyId } from "@/lib/payments/razorpay";

function calculateDiscountAmount(
  planPriceInPaise: number,
  discountPercentage: number
) {
  if (!(Number.isFinite(planPriceInPaise) && planPriceInPaise > 0)) {
    return 0;
  }
  if (!(Number.isFinite(discountPercentage) && discountPercentage > 0)) {
    return 0;
  }
  const rawDiscount = (planPriceInPaise * discountPercentage) / 100;
  let discount = Math.round(rawDiscount);
  if (discount <= 0 && rawDiscount > 0) {
    discount = 1;
  }
  const maxDiscount = Math.max(planPriceInPaise - 1, 1);
  return Math.min(discount, maxDiscount);
}

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:api").toResponse();
    }

    const body = await request.json().catch(() => null);
    const planId = body?.planId as string | undefined;
    const rawCouponCode =
      typeof body?.couponCode === "string" ? body.couponCode : null;
    const normalizedCouponCode = rawCouponCode?.trim().toUpperCase() ?? null;

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

    let appliedCoupon: Awaited<ReturnType<typeof getCouponByCode>> | null =
      null;
    let discountAmount = 0;
    if (normalizedCouponCode) {
      appliedCoupon = await getCouponByCode(normalizedCouponCode);
      const now = Date.now();
      if (
        !appliedCoupon ||
        !appliedCoupon.isActive ||
        (appliedCoupon.validFrom && appliedCoupon.validFrom.getTime() > now) ||
        (appliedCoupon.validTo && appliedCoupon.validTo.getTime() < now)
      ) {
        throw new ChatSDKError(
          "bad_request:coupon",
          "Coupon is invalid or expired."
        );
      }
      discountAmount = calculateDiscountAmount(
        plan.priceInPaise,
        appliedCoupon.discountPercentage
      );
      if (discountAmount <= 0) {
        appliedCoupon = null;
      }
    }

    const payableAmount = Math.max(plan.priceInPaise - discountAmount, 1);

    const razorpay = getRazorpayClient();
    const order = await razorpay.orders.create({
      amount: payableAmount,
      currency: "INR",
      receipt: `recharge-${Date.now()}`,
      notes: {
        planId: plan.id,
        userId: session.user.id,
        couponCode: appliedCoupon?.code ?? null,
      },
    });

    await createPaymentTransaction({
      userId: session.user.id,
      planId: plan.id,
      orderId: order.id,
      amount: Number(order.amount),
      currency: order.currency,
      couponId: appliedCoupon?.id ?? null,
      creatorId: appliedCoupon?.creatorId ?? null,
      discountAmount,
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
      originalAmount: plan.priceInPaise,
      discountAmount,
      appliedCoupon: appliedCoupon
        ? {
            code: appliedCoupon.code,
            discountPercentage: appliedCoupon.discountPercentage,
          }
        : null,
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error("Failed to create Razorpay order", error);
    return new ChatSDKError("bad_request:api").toResponse();
  }
}
