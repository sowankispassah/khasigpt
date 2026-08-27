export const MOBILE_GOOGLE_AUTH_ATTEMPT_COOKIE =
  "__khasigpt_mobile_google_attempt";

export const MOBILE_GOOGLE_AUTH_ATTEMPT_MAX_AGE_SECONDS = 15 * 60;

export const MAX_MOBILE_GOOGLE_ATTEMPT_ID_LENGTH = 80;

export function normalizeMobileGoogleAttemptId(value: string | null) {
  const normalized = value
    ?.replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, MAX_MOBILE_GOOGLE_ATTEMPT_ID_LENGTH);
  return normalized || `web_${Date.now().toString(36)}`;
}

export function createMobileGoogleCompletionUrl(
  origin: string,
  attemptId: string
) {
  const callbackUrl = new URL("/api/mobile/auth/oauth-complete", origin);
  callbackUrl.searchParams.set("attempt", attemptId);
  return callbackUrl;
}
