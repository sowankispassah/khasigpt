import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { withApiTiming } from "@/lib/api/observability";
import {
  loadBillingReadModel,
  loadPricingReadModel,
} from "@/lib/api/read-models";
import { ChatSDKError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const authContext = await getAuthenticatedUser(request);
  if (!authContext?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const [pricing, balance] = await Promise.all([
    withApiTiming("mobile.pricing.plans", loadPricingReadModel),
    withApiTiming("mobile.pricing.balance", () =>
      loadBillingReadModel(authContext.user.id)
    ),
  ]);

  return NextResponse.json(
    {
      ...pricing,
      balance,
    },
    { headers: noStoreHeaders() }
  );
}
