import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import { getCouponByCode, getPricingPlanById } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

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

    if (!normalizedCouponCode) {
      return new ChatSDKError(
        "bad_request:api",
        "Coupon code is required."
      ).toResponse();
    }

    const plan = await getPricingPlanById({ id: planId });

    if (!plan) {
      return new ChatSDKError(
        "not_found:api",
        "Pricing plan not found."
      ).toResponse();
    }

    const coupon = await getCouponByCode(normalizedCouponCode);
    const now = Date.now();

    if (
      !coupon ||
      !coupon.isActive ||
      (coupon.validFrom && coupon.validFrom.getTime() > now) ||
      (coupon.validTo && coupon.validTo.getTime() < now)
    ) {
      throw new ChatSDKError(
        "bad_request:coupon",
        "Coupon is invalid or expired."
      );
    }

    const discountAmount = calculateDiscountAmount(
      plan.priceInPaise,
      coupon.discountPercentage
    );

    if (discountAmount <= 0) {
      throw new ChatSDKError(
        "bad_request:coupon",
        "Coupon cannot be applied to this plan."
      );
    }

    const finalAmount = Math.max(plan.priceInPaise - discountAmount, 1);

    return NextResponse.json({
      ok: true,
      coupon: {
        code: coupon.code,
        discountPercentage: coupon.discountPercentage,
      },
      discountAmount,
      finalAmount,
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error("Failed to validate coupon", error);
    return new ChatSDKError("bad_request:api").toResponse();
  }
}
