import "server-only";

import {
  createMobileSessionFromUser,
  getAuthenticatedUser,
} from "@/lib/api/auth";

export async function getMobileSession(request: Request) {
  const context = await getAuthenticatedUser(request);
  return context?.session ?? null;
}

export const getAuthenticatedSession = getMobileSession;
export { createMobileSessionFromUser };
