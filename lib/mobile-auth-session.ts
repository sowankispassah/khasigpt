import "server-only";

import {
  createMobileSessionFromUser,
  getAuthenticatedUser,
} from "@/lib/api/auth";

type MobileSessionAuthOptions = Parameters<typeof getAuthenticatedUser>[1];

const MOBILE_BEARER_AUTH_TIMEOUT_MS = 2500;
const MOBILE_COOKIE_AUTH_TIMEOUT_MS = 2500;
const WEB_COOKIE_AUTH_TIMEOUT_MS = 4000;

function isMobileApiRequest(request: Request) {
  try {
    return new URL(request.url).pathname.startsWith("/api/mobile/");
  } catch {
    return false;
  }
}

export async function getMobileSession(
  request: Request,
  options?: MobileSessionAuthOptions
) {
  const mobileApiRequest = isMobileApiRequest(request);
  const context = await getAuthenticatedUser(request, {
    allowBearer: options?.allowBearer,
    allowCookie: options?.allowCookie ?? !mobileApiRequest,
    bearerTimeoutMs: options?.bearerTimeoutMs ?? MOBILE_BEARER_AUTH_TIMEOUT_MS,
    cookieTimeoutMs:
      options?.cookieTimeoutMs ??
      (mobileApiRequest ? MOBILE_COOKIE_AUTH_TIMEOUT_MS : WEB_COOKIE_AUTH_TIMEOUT_MS),
    adminLookupTimeoutMs: options?.adminLookupTimeoutMs,
  });
  return context?.session ?? null;
}

export const getAuthenticatedSession = getMobileSession;
export { createMobileSessionFromUser };
