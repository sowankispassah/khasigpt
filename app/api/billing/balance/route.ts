"use server";

import { auth } from "@/app/(auth)/auth";
import { getUserBalanceSummary } from "@/lib/db/queries";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const summary = await getUserBalanceSummary(session.user.id);

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
