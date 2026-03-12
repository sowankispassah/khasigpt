import { fetchWithTimeout } from "@/lib/utils/async";

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 100;
const KV_FETCH_TIMEOUT_MS = 1500;
const REDIS_CONNECT_TIMEOUT_MS = 750;
const REDIS_FAILURE_COOLDOWN_MS = 30_000;

type RedisClientType = import("redis").RedisClientType;
declare const EdgeRuntime: string | undefined;

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

type RateLimitOptions = { windowMs?: number; limit?: number };
type RateLimitResult = { allowed: boolean; remaining: number; resetAt: number };

const shouldUseRemoteRedis =
  process.env.DISABLE_REMOTE_REDIS === "1"
    ? false
    : process.env.NODE_ENV === "development"
      ? process.env.ENABLE_REMOTE_REDIS_IN_DEV === "1"
      : true;
const rawRedisUrl = shouldUseRemoteRedis
  ? process.env.REDIS_URL ?? process.env.KV_URL ?? null
  : null;
const redisUrl = (() => {
  if (!rawRedisUrl) {
    return null;
  }
  try {
    // Validate URL format to avoid redis client throwing on bad input.
    new URL(rawRedisUrl);
    return rawRedisUrl;
  } catch {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
      console.warn("[rate-limit] Ignoring invalid Redis URL");
    }
    return null;
  }
})();
const kvRestUrl = shouldUseRemoteRedis
  ? process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? null
  : null;
const kvRestToken = shouldUseRemoteRedis
  ? process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? null
  : null;
let redisClient: RedisClientType | null = null;
let redisReady = false;
let redisConnectPromise: Promise<void> | null = null;
let redisBlockedUntil = 0;
const hasRestKv = Boolean(kvRestUrl && kvRestToken);

function isRedisBlocked() {
  return Date.now() < redisBlockedUntil;
}

function blockRedisTemporarily() {
  redisBlockedUntil = Date.now() + REDIS_FAILURE_COOLDOWN_MS;
}

function clearRedisBlock() {
  redisBlockedUntil = 0;
}

async function getRedisClient(): Promise<RedisClientType | null> {
  if (typeof EdgeRuntime !== "undefined") {
    return null;
  }
  if (!redisUrl || isRedisBlocked()) {
    return null;
  }
  if (redisClient && redisReady) {
    return redisClient;
  }

  try {
    if (!redisClient) {
      const { createClient } = await import("redis");
      redisClient = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
        },
      });
      redisClient.on("error", (error) => {
        console.error("[rate-limit] Redis error", error);
        redisReady = false;
        blockRedisTemporarily();
      });
    }

    if (!redisReady) {
      if ((redisClient as { isOpen?: boolean }).isOpen) {
        redisReady = true;
        clearRedisBlock();
      } else {
        if (!redisConnectPromise) {
          redisConnectPromise = redisClient
            .connect()
            .then(() => {
              redisReady = true;
              clearRedisBlock();
            })
            .finally(() => {
              redisConnectPromise = null;
            });
        }
        await redisConnectPromise;
      }
    }

    return redisClient;
  } catch (error) {
    console.error("[rate-limit] Failed to connect to Redis", error);
    redisReady = false;
    redisConnectPromise = null;
    blockRedisTemporarily();
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
      Number.isFinite(ttl) && ttl > 0
        ? Date.now() + ttl
        : Date.now() + windowMs;
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

async function incrementRestKv(
  key: string,
  { windowMs, limit }: Required<RateLimitOptions>
): Promise<RateLimitResult | null> {
  if (!hasRestKv) {
    return null;
  }

  try {
    const response = await fetchWithTimeout(
      `${kvRestUrl}/pipeline`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${kvRestToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", key],
          ["PTTL", key],
          ["PEXPIRE", key, windowMs.toString()],
        ]),
      },
      KV_FETCH_TIMEOUT_MS
    );

    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as { result?: unknown[] } | null;
    const results = Array.isArray(json?.result) ? json?.result : null;
    const unwrapResult = (value: unknown) =>
      value && typeof value === "object" && "result" in value
        ? (value as { result: unknown }).result
        : value;

    const countRaw = Array.isArray(results) ? unwrapResult(results[0]) : null;
    const ttlRaw = Array.isArray(results) ? unwrapResult(results[1]) : null;
    const count = typeof countRaw === "number" ? countRaw : Number(countRaw);
    const ttl = typeof ttlRaw === "number" ? ttlRaw : Number(ttlRaw);

    if (!Number.isFinite(count)) {
      return null;
    }

    const resetAt =
      Number.isFinite(ttl) && ttl > 0
        ? Date.now() + ttl
        : Date.now() + windowMs;
    const remaining = Math.max(limit - count, 0);

    return {
      allowed: count <= limit,
      remaining,
      resetAt,
    };
  } catch (error) {
    console.error("[rate-limit] KV REST pipeline failed", error);
    return null;
  }
}

export async function incrementRateLimit(
  key: string,
  { windowMs = DEFAULT_WINDOW_MS, limit = DEFAULT_LIMIT }: RateLimitOptions = {}
): Promise<RateLimitResult> {
  const kvResult = await incrementRestKv(key, { windowMs, limit });
  if (kvResult) {
    return kvResult;
  }

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
