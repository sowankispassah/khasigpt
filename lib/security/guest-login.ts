export const GUEST_SIGNIN_RATE_LIMIT = {
  limit: process.env.PLAYWRIGHT === "true" ? 500 : 10,
  windowMs: 10 * 60 * 1000,
};

export function isGuestLoginEnabled() {
  return process.env.NODE_ENV !== "production" ||
    (process.env.ENABLE_GUEST_LOGIN ?? "false").trim().toLowerCase() === "true";
}
