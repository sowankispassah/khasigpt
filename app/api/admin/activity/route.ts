import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/app/(auth)/auth";
import { getPresenceDetails, getPresenceSummary } from "@/lib/db/queries";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";
import { incrementRateLimit } from "@/lib/security/rate-limit";

const ADMIN_ACTIVITY_RATE_LIMIT = {
  limit: 60,
  windowMs: 60 * 1000,
};

const DETAILS_WINDOW_MINUTES = 15;

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json(
      {
        code: "forbidden:activity",
        message: "Only administrators can view activity telemetry.",
      },
      { status: 403 }
    );
  }

  const clientKey = getClientKeyFromHeaders(request.headers);
  const { allowed, resetAt } = await incrementRateLimit(
    `admin-activity:${clientKey}`,
    ADMIN_ACTIVITY_RATE_LIMIT
  );

  if (!allowed) {
    const retryAfterSeconds = Math.max(
      Math.ceil((resetAt - Date.now()) / 1000),
      1
    ).toString();

    return NextResponse.json(
      {
        code: "rate_limit:activity",
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
  const includeDetails = url.searchParams.get("details") === "1";

  const summary = await getPresenceSummary();
  const details = includeDetails
    ? await getPresenceDetails({
        windowMinutes: DETAILS_WINDOW_MINUTES,
        limit: 6,
      })
    : null;

  return NextResponse.json(
    {
      summary: {
        ...summary,
        updatedAt: new Date().toISOString(),
      },
      details,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
