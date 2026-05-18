import { NextResponse } from "next/server";
import { CACHE_CONTROL, cacheHeaders } from "@/lib/api/cache";
import { withApiTiming } from "@/lib/api/observability";
import { loadPricingReadModel } from "@/lib/api/read-models";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const pricing = await withApiTiming("web.pricing", loadPricingReadModel);

  return NextResponse.json(pricing, {
    headers: cacheHeaders(CACHE_CONTROL.publicShort),
  });
}
