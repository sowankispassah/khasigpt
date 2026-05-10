import "server-only";

import {
  createMobileSessionFromUser,
  getAuthenticatedUser,
} from "@/lib/api/auth";

type MobileSessionAuthOptions = Parameters<typeof getAuthenticatedUser>[1];

export async function getMobileSession(
  request: Request,
  options?: MobileSessionAuthOptions
) {
  const context = await getAuthenticatedUser(request, options);
  return context?.session ?? null;
}

export const getAuthenticatedSession = getMobileSession;
export { createMobileSessionFromUser };
