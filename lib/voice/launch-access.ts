import type { FeatureAccessMode } from "@/lib/feature-access";

// Direct live sessions currently report billable usage from the client.
// Keep them admin-only until trusted server metering replaces that contract.
// Disabled remains disabled; settings/fallbacks cannot open public access.
export function restrictUnmeteredLiveAccess(mode: FeatureAccessMode): FeatureAccessMode {
  return mode === "enabled" ? "admin_only" : mode;
}
