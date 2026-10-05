import { createHash } from "node:crypto";
import { fetchWithResponseTimeout, withTimeout } from "@/lib/utils/async";

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 100;
const REMOTE_TIMEOUT_MS = 1000;
const CONNECT_TIMEOUT_MS = 750;
const FAILURE_COOLDOWN_MS = 30_000;
const MAX_LOCAL_BUCKETS = 10_000;

type RedisClientType = import("redis").RedisClientType;
type Bucket = { count: number; resetAt: number };
type RateLimitOptions = {
  windowMs?: number;
  limit?: number;
  // Local fallback is appropriate only for inexpensive reads. Authentication
  // and billable work require the shared counter in production.
  failureMode?: "closed" | "local";
};
type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  reason?: "unavailable";
};

// One atomic operation for TCP and REST. Later requests never extend the
// window, and a stale counter without an expiry is repaired atomically.
const INCREMENT_SCRIPT = `
  local count = redis.call("INCR", KEYS[1])
  local ttl = redis.call("PTTL", KEYS[1])
  if ttl < 0 then
    redis.call("PEXPIRE", KEYS[1], ARGV[1])
    ttl = tonumber(ARGV[1])
  end
  return {count, ttl}
`;

const buckets = new Map<string, Bucket>();
let nextCleanupAt = 0;
let nextCapacityCleanupAt = 0;
const shouldUseRemoteRedis = process.env.DISABLE_REMOTE_REDIS !== "1" &&
  (process.env.NODE_ENV !== "development" || process.env.ENABLE_REMOTE_REDIS_IN_DEV === "1");
const redisUrl = shouldUseRemoteRedis ? process.env.REDIS_URL ?? process.env.KV_URL : undefined;
const restUrl = shouldUseRemoteRedis ? process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL : undefined;
const restToken = shouldUseRemoteRedis ? process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN : undefined;
let redisClient: RedisClientType | null = null;
let redisConnectPromise: Promise<unknown> | null = null;
let blockedUntil = 0;

function isDisposableTestRun() {
  if (process.env.ISOLATED_TEST_RUN !== "1") return false;
  try {
    const url = new URL(process.env.POSTGRES_URL ?? "");
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      url.pathname.startsWith("/khasigpt_audit_");
  } catch {
    return false;
  }
}

function storageKey(key: string) {
  // Keep user-controlled email/header values out of Redis keys and bound size.
  return `rate-limit:v2:${createHash("sha256").update(key).digest("hex")}`;
}

function unavailable(): RateLimitResult {
  return { allowed: false, remaining: 0, resetAt: Math.max(Date.now() + 1000, blockedUntil), reason: "unavailable" };
}

function decodeCounter(value: unknown, limit: number, windowMs: number): RateLimitResult {
  if (!Array.isArray(value) || value.length !== 2 ||
    !Number.isSafeInteger(value[0]) || value[0] < 1 ||
    !Number.isSafeInteger(value[1]) || value[1] < 0 || value[1] > windowMs) {
    throw new Error("Invalid rate-limit response");
  }
  return { allowed: value[0] <= limit, remaining: Math.max(limit - value[0], 0), resetAt: Date.now() + value[1] };
}

function disconnectRedis() {
  const client = redisClient;
  redisClient = null;
  if (client?.isOpen) {
    try { client.destroy(); } catch { /* Already closed. */ }
  }
}

async function getRedisClient() {
  if (!redisUrl) throw new Error("Shared limiter is not configured");
  const url = new URL(redisUrl);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") throw new Error("Invalid Redis protocol");
  if (!redisClient) {
    const { createClient } = await import("redis");
    redisClient = createClient({
      url: redisUrl,
      disableOfflineQueue: true,
      socket: { connectTimeout: CONNECT_TIMEOUT_MS, reconnectStrategy: false },
    });
    redisClient.on("error", () => {
      // Do not log connection errors: they can contain credential-bearing URLs.
      blockedUntil = Date.now() + FAILURE_COOLDOWN_MS;
    });
  }
  const client = redisClient;
  if (!client.isReady) {
    if (!redisConnectPromise) {
      redisConnectPromise = client.connect().finally(() => { redisConnectPromise = null; });
    }
    await redisConnectPromise;
  }
  if (!client.isReady) throw new Error("Redis is not ready");
  return client;
}

async function restCommand(command: Array<string | number>) {
  if (!restUrl || !restToken) throw new Error("REST limiter is not configured");
  const url = new URL(restUrl);
  if (url.protocol !== "https:") throw new Error("REST limiter requires HTTPS");
  return fetchWithResponseTimeout(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${restToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  }, REMOTE_TIMEOUT_MS, async (response) => {
    if (!response.ok) throw new Error("REST limiter rejected command");
    const body = await response.json() as { result?: unknown; error?: unknown };
    if (!body || body.error || !("result" in body)) throw new Error("Invalid REST response");
    return body.result;
  });
}

async function incrementRemote(key: string, windowMs: number, limit: number) {
  if (Date.now() < blockedUntil) return null;
  try {
    // Never fall back between different stores: that would split a quota.
    const result = await withTimeout((async () => {
      if (restUrl && restToken) {
        return restCommand(["EVAL", INCREMENT_SCRIPT, 1, key, windowMs]);
      }
      const client = await getRedisClient();
      return client.eval(INCREMENT_SCRIPT, { keys: [key], arguments: [String(windowMs)] });
    })(), REMOTE_TIMEOUT_MS, disconnectRedis);
    return decodeCounter(result, limit, windowMs);
  } catch {
    blockedUntil = Date.now() + FAILURE_COOLDOWN_MS;
    disconnectRedis();
    console.warn("[rate-limit] Shared counter unavailable.");
    return null;
  }
}

function incrementLocal(key: string, windowMs: number, limit: number): RateLimitResult {
  const now = Date.now();
  if (now >= nextCleanupAt || (buckets.size >= MAX_LOCAL_BUCKETS && now >= nextCapacityCleanupAt)) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
    nextCleanupAt = now + DEFAULT_WINDOW_MS;
    nextCapacityCleanupAt = now + 1000;
  }
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_LOCAL_BUCKETS && !bucket) return unavailable();
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  if (bucket.count < limit) bucket.count += 1;
  else return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}

export async function incrementRateLimit(key: string, {
  windowMs = DEFAULT_WINDOW_MS,
  limit = DEFAULT_LIMIT,
  failureMode = process.env.NODE_ENV === "production" && !isDisposableTestRun() ? "closed" : "local",
}: RateLimitOptions = {}): Promise<RateLimitResult> {
  if (!Number.isSafeInteger(windowMs) || windowMs < 1 || !Number.isSafeInteger(limit) || limit < 1) {
    throw new Error("Invalid rate-limit policy");
  }
  const hashedKey = storageKey(key);
  const remote = await incrementRemote(hashedKey, windowMs, limit);
  if (remote) return remote;
  return failureMode === "closed" ? unavailable() : incrementLocal(hashedKey, windowMs, limit);
}

export function resetRateLimit(key: string) {
  const hashedKey = storageKey(key);
  buckets.delete(hashedKey);
  if (Date.now() < blockedUntil) return;
  void withTimeout((async () => {
    if (restUrl && restToken) await restCommand(["DEL", hashedKey]);
    else if (redisUrl) await (await getRedisClient()).del(hashedKey);
  })(), REMOTE_TIMEOUT_MS, disconnectRedis).catch(() => undefined);
}
