import type { PricingPlan } from "@/lib/db/schema";

export function getAndroidProductIdForPlan(
  plan: Pick<PricingPlan, "androidProductId">
) {
  const productId = plan.androidProductId?.trim();
  return productId && productId.length > 0 ? productId : null;
}
