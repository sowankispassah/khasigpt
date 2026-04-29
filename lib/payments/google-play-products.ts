import type { PricingPlan } from "@/lib/db/schema";

export function buildDefaultAndroidProductId(plan: Pick<PricingPlan, "id" | "name">) {
  const slug = plan.name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 48);
  const suffix = plan.id.replace(/-/g, "").slice(0, 8);
  return `khasigpt_${slug || "plan"}_${suffix}`;
}

export function getAndroidProductIdForPlan(
  plan: Pick<PricingPlan, "androidProductId" | "id" | "name">
) {
  return plan.androidProductId?.trim() || buildDefaultAndroidProductId(plan);
}
