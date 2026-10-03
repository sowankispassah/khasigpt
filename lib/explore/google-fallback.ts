import "server-only";
import { unstable_cache } from "next/cache";
import { readGoogleBudget, releaseUnusedGooglePhotos, reserveGoogleBudget } from "./google-budget";
import { type ExploreFallbackProvider, GoogleQuotaError, googleBillingMonth } from "./google-budget-policy";
import { EXPLORE_PROVIDER_CACHE_TAG } from "./provider-config";

const getBudgetPolicy = unstable_cache(readGoogleBudget, ["explore-google-budget-v1"], { revalidate: 60, tags: [EXPLORE_PROVIDER_CACHE_TAG] });
export async function runGoogleWithFallback<T>(google: (beforePhoto?: () => void) => Promise<T>, alternatives: Record<ExploreFallbackProvider, () => Promise<T>>) {
  const budget = await getBudgetPolicy();
  if (!budget.enabled) return google();
  const fallback = (reason: string) => {
    console.info("[explore/provider] fallback", { selected: "google", actual: budget.fallbackProvider, reason });
    return alternatives[budget.fallbackProvider]();
  };
  let reservation: Awaited<ReturnType<typeof reserveGoogleBudget>>;
  try { reservation = await reserveGoogleBudget(); }
  catch { return fallback("usage_tracking_unavailable"); }
  if (!reservation) return fallback("monthly_allowance_reached");
  let attemptedPhotos = 0;
  try {
    if (googleBillingMonth() !== reservation.month) throw new GoogleQuotaError();
    const result = await google(() => {
      if (googleBillingMonth() !== reservation.month || attemptedPhotos >= reservation.photos) throw new GoogleQuotaError();
      attemptedPhotos++;
    });
    console.info("[explore/provider] completed", { actual: "google", month: reservation.month, searches: 1, photos: attemptedPhotos });
    return result;
  } catch (error) {
    if (error instanceof GoogleQuotaError) return await fallback("google_quota_reached");
    throw error;
  } finally {
    try { await releaseUnusedGooglePhotos(reservation.month, reservation.photos - attemptedPhotos); }
    catch { console.warn("[explore/provider] unused photo reservation retained"); }
  }
}
