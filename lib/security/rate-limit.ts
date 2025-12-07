const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 100;

type RedisClientType = import("redis").RedisClientType;
declare const EdgeRuntime: string | undefined;

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

type RateLimitOptions = { windowMs?: number; limit?: number };
type RateLimitResult = { allowed: boolean; remaining: number; resetAt: number };

const redisUrl = process.env.REDIS_URL ?? process.env.KV_URL ?? null;
let redisClient: RedisClientType | null = null;
let redisReady = false;

async function getRedisClient(): Promise<RedisClientType | null> {
  if (typeof EdgeRuntime !== "undefined") {
    return null;
  }
  if (!redisUrl) return null;
  if (redisClient && redisReady) {
    return redisClient;
  }

  try {
    if (!redisClient) {
      const { createClient } = await import("redis");
      redisClient = createClient({ url: redisUrl });
      redisClient.on("error", (error) => {
        console.error("[rate-limit] Redis error", error);
        redisReady = false;
      });
    }

    if (!redisReady) {
      await redisClient.connect();
      redisReady = true;
    }

    return redisClient;
  } catch (error) {
    console.error("[rate-limit] Failed to connect to Redis", error);
    redisReady = false;
    return null;
  }
}

async function incrementRedis(
  key: string,
  { windowMs, limit }: Required<RateLimitOptions>
): Promise<RateLimitResult | null> {
  const client = await getRedisClient();
  if (!client) {
    return null;
  }

  try {
    /*
      EVAL script returns:
        - current count after increment
        - ttl remaining in ms
    */
    const script = `
      local current = redis.call("INCR", KEYS[1])
      if current == 1 then
        redis.call("PEXPIRE", KEYS[1], ARGV[1])
      end
      local ttl = redis.call("PTTL", KEYS[1])
      return {current, ttl}
    `;

    const [countRaw, ttlRaw] = (await client.eval(script, {
      keys: [key],
      arguments: [windowMs.toString()],
    })) as [number, number];

    const count = Number(countRaw);
    const ttl = Number(ttlRaw);
    const resetAt =
      Number.isFinite(ttl) && ttl > 0 ? Date.now() + ttl : Date.now() + windowMs;
    const remaining = Math.max(limit - count, 0);

    return {
      allowed: count <= limit,
      remaining,
      resetAt,
    };
  } catch (error) {
    console.error("[rate-limit] Redis evaluation failed", error);
    return null;
  }
}

export async function incrementRateLimit(
  key: string,
  {
    windowMs = DEFAULT_WINDOW_MS,
    limit = DEFAULT_LIMIT,
  }: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const redisResult = await incrementRedis(key, { windowMs, limit });
  if (redisResult) {
    return redisResult;
  }

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
