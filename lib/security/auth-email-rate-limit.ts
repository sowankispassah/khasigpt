import { incrementRateLimit } from "@/lib/security/rate-limit";

const TEN_MINUTES_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Signup and password-reset requests each send an email, and both are open to
// anyone (the mobile app posts to the same server actions). Per-recipient caps
// stop one inbox being flooded; per-network caps stop one client burning the
// sender's daily quota. Recipient budgets are shared across both email kinds.
export const AUTH_EMAIL_RATE_LIMITS = {
  recipientHourly: { limit: 3, windowMs: HOUR_MS },
  recipientDaily: { limit: 6, windowMs: DAY_MS },
  clientBurst: { limit: 5, windowMs: TEN_MINUTES_MS },
  clientDaily: { limit: 40, windowMs: DAY_MS },
} as const;

export type AuthEmailKind = "register" | "password-reset";

export async function allowAuthEmailAttempt({
  clientKey,
  email,
  kind,
}: {
  clientKey: string;
  email: string;
  kind: AuthEmailKind;
}) {
  const recipient = email.trim().toLowerCase();
  const results = await Promise.all([
    incrementRateLimit(
      `${kind}:email-hour:${recipient}`,
      AUTH_EMAIL_RATE_LIMITS.recipientHourly
    ),
    incrementRateLimit(
      `auth-email:recipient-day:${recipient}`,
      AUTH_EMAIL_RATE_LIMITS.recipientDaily
    ),
    incrementRateLimit(
      `${kind}:ip:${clientKey}`,
      AUTH_EMAIL_RATE_LIMITS.clientBurst
    ),
    incrementRateLimit(
      `auth-email:ip-day:${clientKey}`,
      AUTH_EMAIL_RATE_LIMITS.clientDaily
    ),
  ]);

  return results.every((result) => result.allowed);
}
