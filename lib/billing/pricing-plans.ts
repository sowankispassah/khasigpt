import type { PricingPlan } from "@/lib/db/schema";

type SortablePricingPlan = Pick<
  PricingPlan,
  "id" | "name" | "priceInPaise" | "tokenAllowance"
>;

export function comparePricingPlansForDisplay(
  a: SortablePricingPlan,
  b: SortablePricingPlan
) {
  if (a.priceInPaise !== b.priceInPaise) {
    return a.priceInPaise - b.priceInPaise;
  }
  if (a.tokenAllowance !== b.tokenAllowance) {
    return a.tokenAllowance - b.tokenAllowance;
  }
  const nameComparison = a.name.localeCompare(b.name, "en-IN");
  if (nameComparison !== 0) {
    return nameComparison;
  }
  return a.id.localeCompare(b.id);
}

export function sortPricingPlansForDisplay<T extends SortablePricingPlan>(
  plans: T[]
) {
  return [...plans].sort(comparePricingPlansForDisplay);
}
