"use server";

import { auth } from "@/app/(auth)/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { getUserBalanceSummary } from "@/lib/db/queries";
import { withTimeout } from "@/lib/utils/async";

const BALANCE_TIMEOUT_MS = 7000;

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const summary = await withTimeout(
    getUserBalanceSummary(session.user.id),
    BALANCE_TIMEOUT_MS,
    () => {
      console.error("[api/billing/balance] Balance read timed out.", {
        timeoutMs: BALANCE_TIMEOUT_MS,
      });
    }
  ).catch((error) => {
    console.error("[api/billing/balance] Balance read failed.", error);
    return null;
  });

  if (!summary) {
    return Response.json(
      {
        meta: {
          degraded: true,
          degradedSections: ["balance"],
        },
        message: "Balance could not be loaded right now. Please retry.",
      },
      { headers: noStoreHeaders(), status: 503 }
    );
  }

  const body = {
    tokensRemaining: summary.tokensRemaining,
    tokensTotal: summary.tokensTotal,
    creditsRemaining: summary.creditsRemaining,
    creditsTotal: summary.creditsTotal,
    allocatedCredits: summary.allocatedCredits,
    rechargedCredits: summary.rechargedCredits,
    expiresAt: summary.expiresAt?.toISOString() ?? null,
    startedAt: summary.startedAt?.toISOString() ?? null,
    plan: summary.plan
      ? {
          id: summary.plan.id,
          name: summary.plan.name,
          priceInPaise: summary.plan.priceInPaise,
          billingCycleDays: summary.plan.billingCycleDays,
        }
      : null,
  };

  return Response.json(body, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
