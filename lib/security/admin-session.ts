import "server-only";

import { auth } from "@/app/(auth)/auth";
import { getAuthUserRoleById } from "@/lib/db/auth-queries";
import { withTimeout } from "@/lib/utils/async";

const ADMIN_SESSION_TIMEOUT_MS = 4000;
const ADMIN_ROLE_LOOKUP_TIMEOUT_MS = 2500;

// JWT roles are a hint, never authority for an administrator mutation. Do not
// cache this result: each action must confirm a current active administrator.
export async function getActiveAdminSession() {
  const session = await withTimeout(auth(), ADMIN_SESSION_TIMEOUT_MS).catch(() => {
    console.warn("[admin-session] Administrator session could not be confirmed.");
    return null;
  });
  if (!session?.user?.id || session.user.role !== "admin") return null;

  const currentUser = await withTimeout(
    getAuthUserRoleById(session.user.id),
    ADMIN_ROLE_LOOKUP_TIMEOUT_MS
  ).catch(() => {
    console.warn("[admin-session] Current administrator could not be confirmed.");
    return null;
  });
  if (!currentUser?.isActive || currentUser.role !== "admin") return null;

  // Preserve the existing session contract after confirming its current role.
  return session;
}
