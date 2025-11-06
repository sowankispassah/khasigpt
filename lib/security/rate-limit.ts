const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 100;

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export function incrementRateLimit(
  key: string,
  {
    windowMs = DEFAULT_WINDOW_MS,
    limit = DEFAULT_LIMIT,
  }: { windowMs?: number; limit?: number } = {}
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt,
    };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: bucket.resetAt,
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    remaining: limit - bucket.count,
    resetAt: bucket.resetAt,
  };
}

export function resetRateLimit(key: string) {
  buckets.delete(key);
}
