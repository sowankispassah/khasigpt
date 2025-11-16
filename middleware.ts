import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

const ONE_MINUTE = 60 * 1000;
const API_RATE_LIMIT = {
  limit: 120,
  windowMs: ONE_MINUTE,
};

const DEFAULT_ALLOWED_ORIGINS = [
  process.env.APP_BASE_URL,
  process.env.NEXTAUTH_URL,
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.EXPO_PUBLIC_API_BASE_URL,
  process.env.EXPO_PUBLIC_WEB_BASE_URL,
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
    [...DEFAULT_ALLOWED_ORIGINS, ...CORS_ALLOWED_ORIGINS].filter(
      (origin): origin is string => Boolean(origin)
    )
  )
);
const CANONICAL_HOST =
  process.env.CANONICAL_HOST?.toLowerCase() ?? "khasigpt.com";
const SHOULD_ENFORCE_CANONICAL =
  process.env.NODE_ENV === "production" && typeof CANONICAL_HOST === "string";

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

function applyCorsHeaders(
  response: NextResponse,
  corsHeaders: Headers | null
) {
  if (!corsHeaders) {
    return response;
  }

  corsHeaders.forEach((value, key) => {
    response.headers.set(key, value);
  });
  return response;
}

export function middleware(request: NextRequest) {
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
        preflightHeaders.set(
          "Access-Control-Allow-Headers",
          requestHeaders
        );
      }

      return new Response(null, {
        status: 204,
        headers: preflightHeaders,
      });
    }

    const key = `api:${getClientKeyFromHeaders(request.headers)}`;
    const { allowed, resetAt } = incrementRateLimit(key, API_RATE_LIMIT);

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
