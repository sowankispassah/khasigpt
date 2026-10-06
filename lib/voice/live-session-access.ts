import "server-only";

import type { AuthenticatedRouteUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { getAuthUserById } from "@/lib/db/auth-queries";
import { withTimeout } from "@/lib/utils/async";

// Cookie JWT roles may be stale; authorize every live operation against the
// indexed active-user lookup before settings, normalization or provider work.
export async function enforceLiveSessionLaunchAccess(user: Pick<AuthenticatedRouteUser, "id" | "role">, { serverMetered = false }: { serverMetered?: boolean } = {}) {
  const denied = () => Response.json({ liveSupported: false, reason: "feature-disabled", message: "Not found" }, { status: 404, headers: noStoreHeaders() });
  if (!serverMetered && user.role !== "admin") return denied();
  try {
    const current = await withTimeout(getAuthUserById(user.id), 2500);
    if (!current?.isActive || (!serverMetered && current.role !== "admin")) return denied();
    // Do not authorize feature modes with a stale role from a cookie JWT.
    user.role = current.role;
    return null;
  } catch {
    console.warn("[live-session] Active account could not be confirmed.");
    return Response.json({ liveSupported: false, reason: "live-api-unavailable", message: "Authentication lookup is temporarily unavailable." }, { status: 503, headers: noStoreHeaders() });
  }
}
