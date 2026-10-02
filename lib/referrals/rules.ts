import { z } from "zod";

export const REFERRAL_COOKIE = "khasigpt_signup_referral";
export function normalizeReferralCode(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : null;
}

export const referralInputSchema = z.object({
  creatorId: z.string().uuid(),
  percentage: z.coerce.number().int().min(1).max(100),
  duration: z.enum(["indefinite", "months", "first_recharge", "signup_window"]),
  months: z.number().int().min(1).max(1200).nullable().default(null),
  windowDays: z.number().int().min(1).max(36500).nullable().default(null),
  rechargeBefore: z.string().datetime().nullable().default(null),
}).superRefine((value, context) => {
  const valid = value.duration === "months"
    ? value.months !== null && value.windowDays === null && value.rechargeBefore === null
    : value.duration === "signup_window"
      ? value.months === null && ((value.windowDays !== null) !== (value.rechargeBefore !== null))
      : value.months === null && value.windowDays === null && value.rechargeBefore === null;
  if (!valid) context.addIssue({ code: "custom", message: "Choose the duration and its required value." });
});

export function referralDeadline(signup: Date, rule: { duration: string; months: number | null; windowDays: number | null; rechargeBefore: Date | null }) {
  if (rule.duration === "months" && rule.months) {
    const date = new Date(signup);
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + rule.months);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
    return date;
  }
  if (rule.duration === "signup_window") {
    return rule.rechargeBefore ?? (rule.windowDays ? new Date(signup.getTime() + rule.windowDays * 86400000) : signup);
  }
  return null;
}

export function calculateReferralCommission(amount: number, percentage: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isInteger(percentage) || percentage < 1 || percentage > 100) throw new Error("Invalid commission input.");
  return Number((BigInt(amount) * BigInt(percentage) + 50n) / 100n);
}
