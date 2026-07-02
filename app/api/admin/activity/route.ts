import { type NextRequest, NextResponse } from "next/server";

import { getPresenceDetails, getPresenceSummary } from "@/lib/db/queries";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";
import { withTimeout } from "@/lib/utils/async";

const ADMIN_ACTIVITY_RATE_LIMIT = {
  limit: 60,
  windowMs: 60 * 1000,
};

const DETAILS_WINDOW_MINUTES = 15;
const ACTIVITY_SUMMARY_TIMEOUT_MS = 2500;
const ACTIVITY_DETAILS_TIMEOUT_MS = 3500;
const EMPTY_SUMMARY = {
  activeNow: 0,
  active15m: 0,
  active60m: 0,
};

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
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

  let degraded = false;
  const summary = await withTimeout(
    getPresenceSummary(),
    ACTIVITY_SUMMARY_TIMEOUT_MS,
    () => {
      console.error("[admin/activity] Presence summary timed out.", {
        timeoutMs: ACTIVITY_SUMMARY_TIMEOUT_MS,
      });
    }
  ).catch((error) => {
    degraded = true;
    console.error("[admin/activity] Presence summary failed.", error);
    return EMPTY_SUMMARY;
  });
  const details = includeDetails
    ? await withTimeout(
        getPresenceDetails({
          windowMinutes: DETAILS_WINDOW_MINUTES,
          limit: 6,
        }),
        ACTIVITY_DETAILS_TIMEOUT_MS,
        () => {
          console.error("[admin/activity] Presence details timed out.", {
            timeoutMs: ACTIVITY_DETAILS_TIMEOUT_MS,
          });
        }
      ).catch((error) => {
        degraded = true;
        console.error("[admin/activity] Presence details failed.", error);
        return null;
      })
    : null;

  return NextResponse.json(
    {
      meta: {
        degraded,
      },
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
