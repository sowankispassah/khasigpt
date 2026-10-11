import { eq } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import {
  completePaymentTransactionWithSubscription,
  createPaymentTransaction,db,
  getCouponByCode,
  getPaymentTransactionByOrderId,
  getPricingPlanById,
  getUserBalanceSummary,
  markPaymentTransactionFailed,
  markPaymentTransactionProcessing,
  recordCouponRedemptionFromTransaction,} from "@/lib/db/queries";
import { user } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { getMobileSession } from "@/lib/mobile-auth-session";
import {
  consumeGooglePlayProductPurchase,
  getGooglePlayOrderTotal,
  getGooglePlayPackageName,
  getGooglePlayProductPurchase,
  hashGooglePlayPurchaseToken,
} from "@/lib/payments/google-play";
import { getAndroidProductIdForPlan } from "@/lib/payments/google-play-products";
import { runPostCreditStep } from "@/lib/payments/post-credit";
import { deliverReceiptEmail } from "@/lib/payments/receipts";
import { couponsAllowed } from "@/lib/referrals/settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GOOGLE_PLAY_PROCESSING_STALE_MS = 10 * 60_000;

function buildOrderId(tokenHash: string) {
  return `gp_${tokenHash.slice(0, 56)}`;
}

function googlePlayFailure(message: string, status = 400) {
  return NextResponse.json(
    {
      code: "google_play_verification_failed",
      message,
    },
    { status }
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ChatSDKError && typeof error.cause === "string") {
    return error.cause;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export async function POST(request: Request) {
  const session = await getMobileSession(request);
  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  try {
    const body = await request.json().catch(() => null);
    const planId = typeof body?.planId === "string" ? body.planId : null;
    const productId =
      typeof body?.productId === "string" ? body.productId : null;
    const purchaseToken =
      typeof body?.purchaseToken === "string" ? body.purchaseToken : null;
    const rawCouponCode = typeof body?.couponCode === "string" ? body.couponCode.trim().toUpperCase() : null;

    if (!planId || !productId || !purchaseToken) {
      return new ChatSDKError(
        "bad_request:api",
        "Plan id, product id, and purchase token are required."
      ).toResponse();
    }

    const plan = await getPricingPlanById({ id: planId });
    if (!plan || !plan.isActive) {
      return new ChatSDKError(
        "not_found:api",
        "Pricing plan is not available."
      ).toResponse();
    }
    const couponCode = rawCouponCode && await couponsAllowed(session.user.role) ? rawCouponCode : null;
    const appliedCoupon = couponCode ? await getCouponByCode(couponCode) : null;
    const now = Date.now();
    if (couponCode && (!appliedCoupon || !appliedCoupon.isActive || (appliedCoupon.validFrom && appliedCoupon.validFrom.getTime() > now) || (appliedCoupon.validTo && appliedCoupon.validTo.getTime() < now))) {
      return googlePlayFailure("Creator coupon is invalid or expired.");
    }

    const expectedProductId = getAndroidProductIdForPlan(plan);
    if (expectedProductId !== productId) {
      return googlePlayFailure(
        `Google Play product does not match the selected plan. Expected ${expectedProductId}, received ${productId}.`
      );
    }

    const tokenHash = hashGooglePlayPurchaseToken(purchaseToken);
    const orderId = buildOrderId(tokenHash);
    const existing = await getPaymentTransactionByOrderId({ orderId });
    if (existing && existing.userId !== session.user.id) {
      return new ChatSDKError("forbidden:api").toResponse();
    }
    if (existing?.status === "paid") {
      after(async () => { await deliverReceiptEmail(orderId).catch(() => { console.error("[receipts] Delivery scheduling failed", { orderId }); }); });
      await recordCouponRedemptionFromTransaction(existing);
      const balance = await runPostCreditStep(orderId, "balance", () =>
        getUserBalanceSummary(session.user.id)
      );
      return NextResponse.json({ alreadyProcessed: true, balance, ok: true });
    }

    const packageName = getGooglePlayPackageName();
    const purchase = await getGooglePlayProductPurchase({
      packageName,
      productId,
      purchaseToken,
    }).catch((error) => {
      console.error("Failed to fetch Google Play purchase", {
        error,
        packageName,
        productId,
      });
      throw new ChatSDKError(
        "bad_request:api",
        getErrorMessage(error, "Google Play purchase could not be verified.")
      );
    });

    if (purchase.purchaseState !== 0) {
      return googlePlayFailure("Google Play purchase is not completed.");
    }

    const [referralAccount] = await db.select({ code: user.signupReferralCode }).from(user).where(eq(user.id, session.user.id));
    const testPurchase = purchase.purchaseType === 0;
    const receiptTotal = !testPurchase && !existing
      ? await getGooglePlayOrderTotal(purchase.orderId ?? "").catch((error) => {
          if (referralAccount?.code) throw error;
          return { amount: plan.priceInPaise, currency: "INR", unverified: true };
        })
      : { amount: plan.priceInPaise, currency: "INR" };

    const transaction =
      existing ??
      (await createPaymentTransaction({
        userId: session.user.id,
        planId: plan.id,
        orderId,
        amount: receiptTotal.amount,
        currency: receiptTotal.currency,
        couponId: appliedCoupon?.id ?? null,
        creatorId: appliedCoupon?.creatorId ?? null,
        discountAmount: 0,
        provider: "google_play",
        providerProductId: productId,
        providerPurchaseTokenHash: tokenHash,
        notes: {
          testPurchase,
          receiptAmountVerified: !("unverified" in receiptTotal),
          commissionEligible: !testPurchase,
          googleOrderId: purchase.orderId ?? null,
          packageName,
          productId,
          purchaseTimeMillis: purchase.purchaseTimeMillis ?? null,
          quantity: purchase.quantity ?? null,
        },
      }));

    if (transaction.userId !== session.user.id) {
      return new ChatSDKError("forbidden:api").toResponse();
    }

    const locked = await markPaymentTransactionProcessing({
      orderId,
      processingStaleBefore: new Date(
        Date.now() - GOOGLE_PLAY_PROCESSING_STALE_MS
      ),
      retryFailed: true,
      userId: session.user.id,
    });
    if (!locked) {
      const balance = await getUserBalanceSummary(session.user.id);
      return NextResponse.json(
        {
          balance,
          ok: false,
          processing: true,
          message:
            "Purchase verification is already in progress. The app will retry shortly.",
        },
        { status: 202 }
      );
    }

    let completed: Awaited<
      ReturnType<typeof completePaymentTransactionWithSubscription>
    >;
    try {
      completed = await completePaymentTransactionWithSubscription({
        orderId,
        paymentId: purchase.orderId ?? orderId,
        planId: plan.id,
        signature: tokenHash,
        userId: session.user.id,
      });
    } catch (error) {
      await markPaymentTransactionFailed({ orderId });
      throw error;
    }

    // The purchase is credited. Follow-up failures are logged and still answer
    // success; a null balance makes the app refresh it.
    await runPostCreditStep(orderId, "receipt", () =>
      after(async () => { await deliverReceiptEmail(orderId).catch(() => { console.error("[receipts] Delivery scheduling failed", { orderId }); }); })
    );
    await runPostCreditStep(orderId, "coupon-redemption", async () => {
      const completedTransaction = await getPaymentTransactionByOrderId({ orderId });
      if (completedTransaction) await recordCouponRedemptionFromTransaction(completedTransaction);
    });
    await consumeGooglePlayProductPurchase({
      packageName,
      productId,
      purchaseToken,
    }).catch((error) => {
      console.error("Failed to consume Google Play purchase after crediting", {
        error,
        orderId,
        packageName,
        productId,
      });
    });

    const balance = await runPostCreditStep(orderId, "balance", () =>
      getUserBalanceSummary(session.user.id)
    );
    return NextResponse.json({
      alreadyProcessed: completed.alreadyProcessed,
      balance,
      ok: true,
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return googlePlayFailure(
        getErrorMessage(error, "Google Play purchase could not be verified."),
        error.statusCode
      );
    }
    console.error("Failed to verify Google Play purchase", error);
    return googlePlayFailure("Google Play purchase could not be verified.");
  }
}
