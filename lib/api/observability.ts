import "server-only";

type TimingOptions = {
  cache?: "hit" | "miss" | "stale" | "skip";
  metadata?: Record<string, unknown>;
  slowMs?: number;
};

function sanitizeMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) {
    return undefined;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (/token|secret|password|authorization|cookie/i.test(key)) {
      result[key] = value ? "[present]" : "[missing]";
      continue;
    }
    result[key] = value;
  }
  return result;
}

export async function withApiTiming<T>(
  label: string,
  task: () => Promise<T>,
  { cache, metadata, slowMs = 1000 }: TimingOptions = {}
) {
  const startedAt = Date.now();
  try {
    const value = await task();
    const durationMs = Date.now() - startedAt;
    const logPayload = {
      cache,
      durationMs,
      ...sanitizeMetadata(metadata),
    };
    if (durationMs >= slowMs) {
      console.warn(`[api/timing] ${label} slow`, logPayload);
    } else {
      console.info(`[api/timing] ${label}`, logPayload);
    }
    return value;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error(`[api/timing] ${label} failed`, {
      durationMs,
      error: error instanceof Error ? error.message : String(error),
      ...sanitizeMetadata(metadata),
    });
    throw error;
  }
}

export function logApiCache(
  label: string,
  state: "hit" | "miss" | "stale" | "write",
  metadata?: Record<string, unknown>
) {
  console.info(`[api/cache] ${label} ${state}`, sanitizeMetadata(metadata));
}
