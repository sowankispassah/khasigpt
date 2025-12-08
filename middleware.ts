import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

const isProduction = process.env.NODE_ENV === "production";
const DEFAULT_ALLOWED_ORIGINS = [
  process.env.APP_BASE_URL,
  process.env.NEXTAUTH_URL,
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.EXPO_PUBLIC_API_BASE_URL,
  process.env.EXPO_PUBLIC_WEB_BASE_URL,
];
const LOCAL_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8081",
];

const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = Array.from(
  new Set(
    [
      ...DEFAULT_ALLOWED_ORIGINS,
      ...(isProduction ? [] : LOCAL_ALLOWED_ORIGINS),
      ...CORS_ALLOWED_ORIGINS,
    ].filter((origin): origin is string => Boolean(origin))
  )
);
const CANONICAL_HOST =
  process.env.CANONICAL_HOST?.toLowerCase() ?? "khasigpt.com";
const SHOULD_ENFORCE_CANONICAL =
  process.env.NODE_ENV === "production" && typeof CANONICAL_HOST === "string";
const ONE_MINUTE = 60 * 1000;
const API_RATE_LIMIT = {
  limit: 120,
  windowMs: ONE_MINUTE,
};
type RateLimitBucket = { count: number; resetAt: number };
const buckets = new Map<string, RateLimitBucket>();
const kvRestUrl =
  process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? null;
const kvRestToken =
  process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? null;
const hasRestKv = Boolean(kvRestUrl && kvRestToken);

async function incrementRestKv(key: string) {
  if (!hasRestKv) {
    return null;
  }

  try {
    const response = await fetch(`${kvRestUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${kvRestToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["PTTL", key],
        ["PEXPIRE", key, API_RATE_LIMIT.windowMs.toString()],
      ]),
    });

    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as { result?: unknown[] } | null;
    const results = Array.isArray(json?.result) ? json?.result : null;
    const unwrap = (value: unknown) =>
      value && typeof value === "object" && "result" in value
        ? (value as { result: unknown }).result
        : value;
    const countRaw = Array.isArray(results) ? unwrap(results[0]) : null;
    const ttlRaw = Array.isArray(results) ? unwrap(results[1]) : null;
    const count = typeof countRaw === "number" ? countRaw : Number(countRaw);
    const ttl = typeof ttlRaw === "number" ? ttlRaw : Number(ttlRaw);

    if (!Number.isFinite(count)) {
      return null;
    }

    const resetAt =
      Number.isFinite(ttl) && ttl > 0
        ? Date.now() + ttl
        : Date.now() + API_RATE_LIMIT.windowMs;

    return {
      allowed: count <= API_RATE_LIMIT.limit,
      resetAt,
    };
  } catch {
    return null;
  }
}

async function incrementRateLimit(key: string) {
  const kvResult = await incrementRestKv(key);
  if (kvResult) {
    return kvResult;
  }

  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + API_RATE_LIMIT.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, resetAt };
  }

  if (bucket.count >= API_RATE_LIMIT.limit) {
    return { allowed: false, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  buckets.set(key, bucket);
  return { allowed: true, resetAt: bucket.resetAt };
}

function getCorsHeaders(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || ALLOWED_ORIGINS.length === 0) {
    return null;
  }
  const normalizedOrigin = origin.toLowerCase();
  const isAllowed = ALLOWED_ORIGINS.some(
    (allowedOrigin) => allowedOrigin.toLowerCase() === normalizedOrigin
  );

  if (!isAllowed) {
    return null;
  }

  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.append("Vary", "Origin");
  return headers;
}

function applyCorsHeaders(response: NextResponse, corsHeaders: Headers | null) {
  if (!corsHeaders) {
    return response;
  }

  corsHeaders.forEach((value, key) => {
    response.headers.set(key, value);
  });
  return response;
}

export async function middleware(request: NextRequest) {
  const hostname = request.headers.get("host")?.toLowerCase();
  if (
    SHOULD_ENFORCE_CANONICAL &&
    hostname &&
    hostname !== CANONICAL_HOST &&
    !hostname.startsWith("localhost") &&
    hostname !== "127.0.0.1"
  ) {
    const redirectUrl = new URL(request.url);
    redirectUrl.host = CANONICAL_HOST;
    redirectUrl.protocol = "https:";
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    const corsHeaders = getCorsHeaders(request);

    if (request.method === "OPTIONS") {
      const preflightHeaders = new Headers(corsHeaders ?? undefined);
      if (corsHeaders) {
        preflightHeaders.set(
          "Access-Control-Allow-Methods",
          "GET,POST,PUT,PATCH,DELETE,OPTIONS"
        );
        const requestHeaders =
          request.headers.get("Access-Control-Request-Headers") ??
          "authorization,content-type";
        preflightHeaders.set("Access-Control-Allow-Headers", requestHeaders);
      }

      return new Response(null, {
        status: 204,
        headers: preflightHeaders,
      });
    }

    const key = `api:${getClientKeyFromHeaders(request.headers)}`;
    const { allowed, resetAt } = await incrementRateLimit(key);

    if (!allowed) {
      const retryAfter = Math.max(
        Math.ceil((resetAt - Date.now()) / 1000),
        1
      ).toString();

      const rateLimitedResponse = NextResponse.json(
        {
          code: "rate_limit:api",
          message: "Too many requests. Please try again later.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": retryAfter,
          },
        }
      );
      return applyCorsHeaders(rateLimitedResponse, corsHeaders);
    }

    const response = NextResponse.next();
    return applyCorsHeaders(response, corsHeaders);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/chat).*)"],
};
