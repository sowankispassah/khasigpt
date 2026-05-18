import "server-only";

import { withTimeout } from "@/lib/utils/async";

const DEFAULT_ADMIN_QUERY_TIMEOUT_MS = 5000;

export async function adminQueryOr<T>({
  fallback,
  label,
  promise,
  timeoutMs = DEFAULT_ADMIN_QUERY_TIMEOUT_MS,
}: {
  fallback: T;
  label: string;
  promise: Promise<T>;
  timeoutMs?: number;
}) {
  try {
    return await withTimeout(promise, timeoutMs, () => {
      console.error(`[admin] ${label} query timed out.`, { timeoutMs });
    });
  } catch (error) {
    console.error(`[admin] ${label} query failed. Using fallback.`, error);
    return fallback;
  }
}
