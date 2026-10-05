import "server-only";

import type { AuthenticatedRouteUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { getAuthUserById } from "@/lib/db/auth-queries";
import { withTimeout } from "@/lib/utils/async";

// Cookie JWT roles may be stale; authorize every live operation against the
// indexed active-user lookup before settings, normalization or provider work.
export async function enforceLiveSessionLaunchAccess(user: Pick<AuthenticatedRouteUser, "id" | "role">) {
  const denied = () => Response.json({ liveSupported: false, reason: "feature-disabled", message: "Not found" }, { status: 404, headers: noStoreHeaders() });
  if (user.role !== "admin") return denied();
  try {
    const current = await withTimeout(getAuthUserById(user.id), 2500);
    return current?.isActive && current.role === "admin" ? null : denied();
  } catch {
    console.warn("[live-session] Active administrator could not be confirmed.");
    return Response.json({ liveSupported: false, reason: "live-api-unavailable", message: "Authentication lookup is temporarily unavailable." }, { status: 503, headers: noStoreHeaders() });
  }
}
