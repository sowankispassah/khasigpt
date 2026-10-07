import "server-only";

import { cache } from "react";
import { auth } from "@/app/(auth)/auth";
import { getAuthUserRoleById } from "@/lib/db/auth-queries";
import { hasCurrentSessionVersion } from "@/lib/security/session-version";
import { withTimeout } from "@/lib/utils/async";

const ADMIN_SESSION_TIMEOUT_MS = 4000;
const ADMIN_ROLE_LOOKUP_TIMEOUT_MS = 2500;

// One session read per admin request: the admin layout and its page share this
// result instead of each re-validating the same session against the database.
// Server actions run as separate requests and still read their own session.
export const getAdminRequestSession = cache(() => auth());

// JWT roles are a hint, never authority for an administrator mutation. Do not
// cache this result: each action must confirm a current active administrator.
export async function getActiveAdminSession() {
  const session = await withTimeout(getAdminRequestSession(), ADMIN_SESSION_TIMEOUT_MS).catch(() => {
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
  if (!currentUser?.isActive || currentUser.role !== "admin" || !hasCurrentSessionVersion(session.user.sessionVersion, currentUser.sessionVersion)) return null;

  // Preserve the existing session contract after confirming its current role.
  return session;
}
