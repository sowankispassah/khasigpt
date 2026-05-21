import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { withApiTiming } from "@/lib/api/observability";
import {
  loadBillingReadModel,
  loadPricingReadModel,
} from "@/lib/api/read-models";
import { ChatSDKError } from "@/lib/errors";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MOBILE_PRICING_TIMEOUT_MS = 9000;
const MOBILE_BALANCE_TIMEOUT_MS = 9000;

export async function GET(request: Request) {
  const authContext = await getAuthenticatedUser(request);
  if (!authContext?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const [pricing, balance] = await Promise.all([
    withApiTiming("mobile.pricing.plans", () =>
      withTimeout(loadPricingReadModel(), MOBILE_PRICING_TIMEOUT_MS, () => {
        console.error("[api/mobile/pricing] Pricing read timed out.", {
          timeoutMs: MOBILE_PRICING_TIMEOUT_MS,
        });
      })
    ).catch((error) => {
      console.error("[api/mobile/pricing] Pricing read failed.", error);
      return null;
    }),
    withApiTiming("mobile.pricing.balance", () =>
      withTimeout(
        loadBillingReadModel(authContext.user.id),
        MOBILE_BALANCE_TIMEOUT_MS,
        () => {
          console.error("[api/mobile/pricing] Balance read timed out.", {
            timeoutMs: MOBILE_BALANCE_TIMEOUT_MS,
          });
        }
      )
    ).catch((error) => {
      console.error("[api/mobile/pricing] Balance read failed.", error);
      return null;
    }),
  ]);

  if (!pricing || !balance) {
    return NextResponse.json(
      {
        degraded: true,
        message: "Pricing could not be loaded right now. Please retry.",
      },
      { headers: noStoreHeaders(), status: 503 }
    );
  }

  return NextResponse.json(
    {
      ...pricing,
      balance,
    },
    { headers: noStoreHeaders() }
  );
}
