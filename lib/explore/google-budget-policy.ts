import { z } from "zod";

export const GOOGLE_BUDGET_SETTING_KEY = "explore.googleFreeBudget";
export const GOOGLE_PHOTO_RESERVATION = 20;
export const EXPLORE_FALLBACK_PROVIDERS = ["serper", "serpent", "openstreetmap"] as const;
export type ExploreFallbackProvider = (typeof EXPLORE_FALLBACK_PROVIDERS)[number];
const count = z.number().int().min(0).max(10_000_000);
export const googleBudgetInputSchema = z.object({
  enabled: z.boolean(), fallbackProvider: z.enum(EXPLORE_FALLBACK_PROVIDERS).default("serper"), searchLimit: count, photoLimit: count,
  searchOffset: count, photoOffset: count,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
}).strict();
export const googleBudgetSchema = googleBudgetInputSchema.extend({ searchUsed: count, photoUsed: count });
export type GoogleBudget = z.infer<typeof googleBudgetSchema>;
export type GoogleBudgetInput = z.infer<typeof googleBudgetInputSchema>;

// Maps free usage resets at midnight Pacific time, not the user's local midnight.
export function googleBillingMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit" }).formatToParts(now);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}
export function parseGoogleBudget(value: unknown, month = googleBillingMonth()): GoogleBudget {
  // Use the smaller global allowance until an admin confirms their pricing region.
  if (value === undefined || value === null) return { enabled: false, fallbackProvider: "serper", searchLimit: 1000, photoLimit: 1000, searchOffset: 0, photoOffset: 0, searchUsed: 0, photoUsed: 0, month };
  const saved = googleBudgetSchema.parse(value);
  return saved.month === month ? saved : { ...saved, month, searchUsed: 0, photoUsed: 0, searchOffset: 0, photoOffset: 0 };
}
export function googleBudgetHasRoom(budget: GoogleBudget) {
  return budget.searchUsed + budget.searchOffset + 1 <= budget.searchLimit && budget.photoUsed + budget.photoOffset + GOOGLE_PHOTO_RESERVATION <= budget.photoLimit;
}
export class GoogleQuotaError extends Error {
  constructor() { super("google_quota_unavailable"); }
}
