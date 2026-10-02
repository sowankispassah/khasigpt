import "server-only";
import { BILLING_COUPONS_ACCESS_KEY, CREATOR_REFERRALS_ACCESS_KEY } from "@/lib/constants";
import { getLiteAppSettingsByKeysUncached } from "@/lib/db/app-settings-lite";
import { parseFeatureAccessModeStrict } from "@/lib/feature-access";
import { withTimeout } from "@/lib/utils/async";

export async function getReferralSettings() {
  const rows = await withTimeout(getLiteAppSettingsByKeysUncached([CREATOR_REFERRALS_ACCESS_KEY, BILLING_COUPONS_ACCESS_KEY]), 4000);
  const values = new Map(rows.map(row => [row.key, row.value]));
  return {
    referralAccessMode: parseFeatureAccessModeStrict(values.get(CREATOR_REFERRALS_ACCESS_KEY)) ?? "admin_only",
    couponAccessMode: parseFeatureAccessModeStrict(values.get(BILLING_COUPONS_ACCESS_KEY)) ?? "disabled",
  };
}

export async function couponsAllowed(role: string | null | undefined) {
  const { couponAccessMode } = await getReferralSettings();
  return couponAccessMode === "enabled" || (couponAccessMode === "admin_only" && role === "admin");
}
