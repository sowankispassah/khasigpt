import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { incrementRateLimit } from "@/lib/security/rate-limit";

const ONE_MINUTE = 60 * 1000;
const API_RATE_LIMIT = {
  limit: 120,
  windowMs: ONE_MINUTE,
};

function getClientKey(request: NextRequest) {
  const forwardedFor =
    request.headers.get("x-forwarded-for") ??
    request.headers.get("forwarded") ??
    "";
  const ip =
    request.ip ??
    forwardedFor.split(",")[0]?.trim() ??
    request.headers.get("cf-connecting-ip") ??
    "unknown";
  return ip;
}

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const key = `api:${getClientKey(request)}`;
    const { allowed, resetAt } = incrementRateLimit(key, API_RATE_LIMIT);

    if (!allowed) {
      const retryAfter = Math.max(
        Math.ceil((resetAt - Date.now()) / 1000),
        1
      ).toString();

      return NextResponse.json(
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
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
