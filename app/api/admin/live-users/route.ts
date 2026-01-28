import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/app/(auth)/auth";
import { listLiveUsers } from "@/lib/db/queries";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";
import { incrementRateLimit } from "@/lib/security/rate-limit";

const LIVE_USERS_RATE_LIMIT = {
  limit: 60,
  windowMs: 60 * 1000,
};

const ALLOWED_WINDOWS = new Set([5, 15, 60]);

export const runtime = "nodejs";

function parseNumber(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json(
      {
        code: "forbidden:live_users",
        message: "Only administrators can view live users.",
      },
      { status: 403 }
    );
  }

  const clientKey = getClientKeyFromHeaders(request.headers);
  const { allowed, resetAt } = await incrementRateLimit(
    `admin-live-users:${clientKey}`,
    LIVE_USERS_RATE_LIMIT
  );

  if (!allowed) {
    const retryAfterSeconds = Math.max(
      Math.ceil((resetAt - Date.now()) / 1000),
      1
    ).toString();

    return NextResponse.json(
      {
        code: "rate_limit:live_users",
        message: "Too many requests. Please try again later.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfterSeconds,
        },
      }
    );
  }

  const url = new URL(request.url);
  const windowMinutes = parseNumber(url.searchParams.get("window"), 5);
  const limit = parseNumber(url.searchParams.get("limit"), 100);
  const offset = parseNumber(url.searchParams.get("offset"), 0);
  const resolvedWindow = ALLOWED_WINDOWS.has(windowMinutes) ? windowMinutes : 5;

  const result = await listLiveUsers({
    windowMinutes: resolvedWindow,
    limit,
    offset,
  });

  return NextResponse.json(
    {
      ...result,
      updatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
