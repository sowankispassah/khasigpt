import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/app/(auth)/auth";
import { upsertUserPresence } from "@/lib/db/queries";
import { getClientInfoFromHeaders } from "@/lib/security/client-info";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";
import { incrementRateLimit } from "@/lib/security/rate-limit";

const HEARTBEAT_RATE_LIMIT = {
  limit: 90,
  windowMs: 60 * 1000,
};

const UUID_SEGMENT_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizePath(path: string | null | undefined) {
  if (!path || typeof path !== "string") {
    return null;
  }

  const trimmed = path.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return null;
  }

  let normalized = trimmed;
  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      normalized = new URL(trimmed).pathname;
    }
  } catch {
    // ignore malformed URLs
  }

  normalized = normalized.split("?")[0]?.split("#")[0] ?? normalized;
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  const parts = normalized
    .split("/")
    .map((segment) => (UUID_SEGMENT_REGEX.test(segment) ? ":id" : segment));

  return parts.join("/").slice(0, 160);
}

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.replace(/[\r\n]/g, " ").trim();
  if (!cleaned) {
    return null;
  }
  return cleaned.slice(0, maxLength);
}

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { code: "unauthorized:presence", message: "Not signed in." },
      { status: 401 }
    );
  }

  const payload = await request.json().catch(() => ({}));
  const clientKey = getClientKeyFromHeaders(request.headers);
  const { allowed, resetAt } = await incrementRateLimit(
    `presence:${session.user.id}:${clientKey}`,
    HEARTBEAT_RATE_LIMIT
  );

  if (!allowed) {
    const retryAfterSeconds = Math.max(
      Math.ceil((resetAt - Date.now()) / 1000),
      1
    ).toString();
    return NextResponse.json(
      {
        code: "rate_limit:presence",
        message: "Too many presence updates. Please try again later.",
      },
      {
        status: 429,
        headers: {
          "Retry-After": retryAfterSeconds,
        },
      }
    );
  }

  const path = normalizePath(payload?.path);
  const locale = normalizeText(payload?.locale, 32);
  const timezone = normalizeText(payload?.timezone, 64);

  const { device } = await getClientInfoFromHeaders();
  const country = normalizeText(
    request.headers.get("x-vercel-ip-country"),
    32
  );
  const region = normalizeText(
    request.headers.get("x-vercel-ip-country-region"),
    128
  );
  const city = normalizeText(request.headers.get("x-vercel-ip-city"), 128);

  await upsertUserPresence({
    userId: session.user.id,
    lastPath: path,
    device,
    locale,
    timezone,
    city,
    region,
    country,
  });

  return NextResponse.json(
    { ok: true, timestamp: new Date().toISOString() },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
