import "server-only";

import { withTimeout } from "@/lib/utils/async";

const DEFAULT_ADMIN_QUERY_TIMEOUT_MS = 10_000;
const MIN_ADMIN_QUERY_TIMEOUT_MS = 1_000;
const MAX_ADMIN_QUERY_TIMEOUT_MS = 30_000;

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

function normalizeAdminQueryTimeoutMs(value: unknown, fallbackMs: number) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  const candidate =
    Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
  return Math.min(
    MAX_ADMIN_QUERY_TIMEOUT_MS,
    Math.max(MIN_ADMIN_QUERY_TIMEOUT_MS, Math.trunc(candidate))
  );
}

export function getAdminQueryTimeoutMs(
  fallbackMs = DEFAULT_ADMIN_QUERY_TIMEOUT_MS
) {
  return normalizeAdminQueryTimeoutMs(
    process.env.ADMIN_QUERY_TIMEOUT_MS,
    fallbackMs
  );
}

function resolveAdminQueryTimeoutMs(timeoutMs: number | undefined) {
  return typeof timeoutMs === "number"
    ? normalizeAdminQueryTimeoutMs(timeoutMs, getAdminQueryTimeoutMs())
    : getAdminQueryTimeoutMs();
}

export async function adminQueryResult<T>({
  fallback,
  label,
  promise,
  timeoutMs,
}: {
  fallback: T;
  label: string;
  promise: Promise<T>;
  timeoutMs?: number;
}): Promise<AdminQueryResult<T>> {
  const resolvedTimeoutMs = resolveAdminQueryTimeoutMs(timeoutMs);
  const startedAt = Date.now();
  try {
    const data = await withTimeout(promise, resolvedTimeoutMs, () => {
      console.error(`[admin] ${label} query timed out.`, {
        durationMs: Date.now() - startedAt,
        timeoutMs: resolvedTimeoutMs,
      });
    });
    return {
      data,
      error: null,
      ok: true,
    };
  } catch (error) {
    console.error(`[admin] ${label} query failed. Using fallback.`, {
      durationMs: Date.now() - startedAt,
      error,
      timeoutMs: resolvedTimeoutMs,
    });
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
  timeoutMs,
}: {
  fallback: T;
  label: string;
  promise: Promise<T>;
  timeoutMs?: number;
}) {
  const result = await adminQueryResult({ fallback, label, promise, timeoutMs });
  return result.data;
}
