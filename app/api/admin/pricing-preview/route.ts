import { type NextRequest, NextResponse } from "next/server";
import {
  calculateWalletUnitsPerInr,
  selectBaseCreditPlan,
} from "@/lib/billing/cost-plus";
import { listAdminPricingPlans } from "@/lib/db/queries";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { getUsdToInrRate } from "@/lib/services/exchange-rate";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READ_TIMEOUT_MS = 5_000;
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const user = await requireAdminApiUser(request);
  if (!user) {
    return NextResponse.json(
      { error: "forbidden" },
      { headers: NO_STORE_HEADERS, status: 403 }
    );
  }

  try {
    const [plans, exchangeRate] = await Promise.all([
      withTimeout(
        listAdminPricingPlans({ includeInactive: true, limit: 200 }),
        READ_TIMEOUT_MS
      ),
      withTimeout(getUsdToInrRate(), READ_TIMEOUT_MS),
    ]);
    const basePlan = selectBaseCreditPlan(
      plans.filter((plan) => plan.isActive && !plan.deletedAt)
    );
    const walletUnitsPerInr = calculateWalletUnitsPerInr(basePlan);

    if (!basePlan || walletUnitsPerInr <= 0 || exchangeRate.rate <= 0) {
      return NextResponse.json(
        { error: "pricing_context_unavailable" },
        { headers: NO_STORE_HEADERS, status: 503 }
      );
    }

    return NextResponse.json(
      {
        basePlanName: basePlan.name,
        usdToInr: exchangeRate.rate,
        walletUnitsPerInr,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("[api/admin/pricing-preview] Pricing context read failed.", error);
    return NextResponse.json(
      { error: "pricing_context_unavailable" },
      { headers: NO_STORE_HEADERS, status: 503 }
    );
  }
}
