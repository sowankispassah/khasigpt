import { NextResponse } from "next/server";
import {
  completePaymentTransactionWithSubscription,
  createPaymentTransaction,
  getPaymentTransactionByOrderId,
  getPricingPlanById,
  getUserBalanceSummary,
  markPaymentTransactionFailed,
  markPaymentTransactionProcessing,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getMobileSession } from "@/lib/mobile-auth-session";
import {
  consumeGooglePlayProductPurchase,
  getGooglePlayPackageName,
  getGooglePlayProductPurchase,
  hashGooglePlayPurchaseToken,
} from "@/lib/payments/google-play";
import { getAndroidProductIdForPlan } from "@/lib/payments/google-play-products";

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
      return googlePlayFailure(
        `Google Play product does not match the selected plan. Expected ${expectedProductId}, received ${productId}.`
      );
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

    try {
      const completed = await completePaymentTransactionWithSubscription({
        orderId,
        paymentId: purchase.orderId ?? orderId,
        planId: plan.id,
        signature: tokenHash,
        userId: session.user.id,
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

      const balance = await getUserBalanceSummary(session.user.id);
      return NextResponse.json({
        alreadyProcessed: completed.alreadyProcessed,
        balance,
        ok: true,
      });
    } catch (error) {
      await markPaymentTransactionFailed({ orderId });
      throw error;
    }
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
