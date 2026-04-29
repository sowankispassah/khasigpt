import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  createPaymentTransaction,
  createUserSubscription,
  getPaymentTransactionByOrderId,
  getPricingPlanById,
  getUserBalanceSummary,
  markPaymentTransactionFailed,
  markPaymentTransactionPaid,
  markPaymentTransactionProcessing,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import {
  consumeGooglePlayProductPurchase,
  getGooglePlayPackageName,
  getGooglePlayProductPurchase,
  hashGooglePlayPurchaseToken,
} from "@/lib/payments/google-play";
import { getAndroidProductIdForPlan } from "@/lib/payments/google-play-products";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function buildOrderId(tokenHash: string) {
  return `gp_${tokenHash.slice(0, 56)}`;
}

export async function POST(request: Request) {
  const session = await auth();
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

    const expectedProductId = getAndroidProductIdForPlan(plan);
    if (expectedProductId !== productId) {
      return new ChatSDKError(
        "bad_request:api",
        "Google Play product does not match the selected plan."
      ).toResponse();
    }

    const tokenHash = hashGooglePlayPurchaseToken(purchaseToken);
    const orderId = buildOrderId(tokenHash);
    const existing = await getPaymentTransactionByOrderId({ orderId });
    if (existing?.status === "paid") {
      const balance = await getUserBalanceSummary(session.user.id);
      return NextResponse.json({ alreadyProcessed: true, balance, ok: true });
    }

    const packageName = getGooglePlayPackageName();
    const purchase = await getGooglePlayProductPurchase({
      packageName,
      productId,
      purchaseToken,
    });

    if (purchase.purchaseState !== 0) {
      return new ChatSDKError(
        "bad_request:api",
        "Google Play purchase is not completed."
      ).toResponse();
    }

    const transaction =
      existing ??
      (await createPaymentTransaction({
        userId: session.user.id,
        planId: plan.id,
        orderId,
        amount: plan.priceInPaise,
        currency: "INR",
        provider: "google_play",
        providerProductId: productId,
        providerPurchaseTokenHash: tokenHash,
        notes: {
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
      userId: session.user.id,
    });
    if (!locked && transaction.status !== "processing") {
      return new ChatSDKError(
        "bad_request:api",
        "Purchase is already being processed. Please try again shortly."
      ).toResponse();
    }

    try {
      await createUserSubscription({
        userId: session.user.id,
        planId: plan.id,
      });
      await consumeGooglePlayProductPurchase({
        packageName,
        productId,
        purchaseToken,
      });
      await markPaymentTransactionPaid({
        orderId,
        paymentId: purchase.orderId ?? orderId,
        signature: tokenHash,
      });

      const balance = await getUserBalanceSummary(session.user.id);
      return NextResponse.json({ balance, ok: true });
    } catch (error) {
      await markPaymentTransactionFailed({ orderId });
      throw error;
    }
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    console.error("Failed to verify Google Play purchase", error);
    return new ChatSDKError("bad_request:api").toResponse();
  }
}
