import "server-only";

import { withTimeout } from "@/lib/utils/async";

const DEFAULT_ADMIN_QUERY_TIMEOUT_MS = 5000;

export type AdminQueryResult<T> =
  | {
      data: T;
      error: null;
      ok: true;
    }
  | {
      data: T;
      error: string;
      ok: false;
    };

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "The query failed before this section could confirm its data.";
}

export async function adminQueryResult<T>({
  fallback,
  label,
  promise,
  timeoutMs = DEFAULT_ADMIN_QUERY_TIMEOUT_MS,
}: {
  fallback: T;
  label: string;
  promise: Promise<T>;
  timeoutMs?: number;
}): Promise<AdminQueryResult<T>> {
  try {
    return {
      data: await withTimeout(promise, timeoutMs, () => {
        console.error(`[admin] ${label} query timed out.`, { timeoutMs });
      }),
      error: null,
      ok: true,
    };
  } catch (error) {
    console.error(`[admin] ${label} query failed. Using fallback.`, error);
    return {
      data: fallback,
      error: getErrorMessage(error),
      ok: false,
    };
  }
}

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
  const result = await adminQueryResult({ fallback, label, promise, timeoutMs });
  return result.data;
}
