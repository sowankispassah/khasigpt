import { NextResponse } from "next/server";
import { CACHE_CONTROL, cacheHeaders, noStoreHeaders } from "@/lib/api/cache";
import { withApiTiming } from "@/lib/api/observability";
import { loadPricingReadModel } from "@/lib/api/read-models";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WEB_PRICING_TIMEOUT_MS = 9000;

export async function GET() {
  const pricing = await withApiTiming("web.pricing", () =>
    withTimeout(loadPricingReadModel(), WEB_PRICING_TIMEOUT_MS, () => {
      console.error("[api/web/pricing] Pricing read timed out.", {
        timeoutMs: WEB_PRICING_TIMEOUT_MS,
      });
    })
  ).catch((error) => {
    console.error("[api/web/pricing] Pricing read failed.", error);
    return null;
  });

  if (!pricing) {
    return NextResponse.json(
      {
        degraded: true,
        message: "Pricing could not be loaded right now. Please retry.",
      },
      { headers: noStoreHeaders(), status: 503 }
    );
  }

  return NextResponse.json(pricing, {
    headers: cacheHeaders(CACHE_CONTROL.publicShort),
  });
}
