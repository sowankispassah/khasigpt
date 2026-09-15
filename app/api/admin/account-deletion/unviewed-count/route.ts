import { type NextRequest, NextResponse } from "next/server";
import { getUnviewedAccountDeletionRequestCount } from "@/lib/db/queries";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COUNT_RATE_LIMIT = {
  limit: 120,
  windowMs: 60 * 1000,
};

export async function GET(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return NextResponse.json(
      {
        code: "forbidden:account_deletion_count",
        message: "Only administrators can view account deletion counts.",
      },
      { status: 403 }
    );
  }

  const clientKey = getClientKeyFromHeaders(request.headers);
  const { allowed, resetAt } = await incrementRateLimit(
    `admin-account-deletion-count:${admin.id}:${clientKey}`,
    COUNT_RATE_LIMIT
  );

  if (!allowed) {
    return NextResponse.json(
      {
        code: "rate_limit:account_deletion_count",
        message: "Too many badge count requests. Please retry shortly.",
      },
      {
        headers: {
          "Retry-After": Math.max(
            Math.ceil((resetAt - Date.now()) / 1000),
            1
          ).toString(),
        },
        status: 429,
      }
    );
  }

  try {
    const count = await getUnviewedAccountDeletionRequestCount();
    return NextResponse.json(
      { count, updatedAt: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("[admin.account-deletion] Failed to load unviewed count.", error);
    return NextResponse.json(
      {
        code: "bad_request:account_deletion_count",
        message: "Unable to load account deletion notification count.",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status: 500,
      }
    );
  }
}
