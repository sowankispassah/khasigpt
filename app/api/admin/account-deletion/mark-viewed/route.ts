import { type NextRequest, NextResponse } from "next/server";
import { markAccountDeletionRequestsViewed } from "@/lib/db/queries";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { getClientInfoFromHeaders } from "@/lib/security/client-info";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MARK_VIEWED_RATE_LIMIT = {
  limit: 60,
  windowMs: 60 * 1000,
};

function parseRequestIds(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .slice(0, 100);
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return NextResponse.json(
      {
        code: "forbidden:account_deletion_mark_viewed",
        message: "Only administrators can mark deletion requests as viewed.",
      },
      { status: 403 }
    );
  }

  const clientKey = getClientKeyFromHeaders(request.headers);
  const { allowed, resetAt } = await incrementRateLimit(
    `admin-account-deletion-mark-viewed:${admin.id}:${clientKey}`,
    MARK_VIEWED_RATE_LIMIT
  );

  if (!allowed) {
    return NextResponse.json(
      {
        code: "rate_limit:account_deletion_mark_viewed",
        message: "Too many mark-viewed requests. Please retry shortly.",
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

  let requestIds: string[] | null = null;
  try {
    const body = await request.json().catch(() => null);
    requestIds = parseRequestIds(
      body && typeof body === "object"
        ? (body as { requestIds?: unknown }).requestIds
        : null
    );
  } catch {
    requestIds = null;
  }

  try {
    const result = await markAccountDeletionRequestsViewed({
      adminUserId: admin.id,
      clientInfo: await getClientInfoFromHeaders(),
      requestIds,
    });

    return NextResponse.json(
      { ...result, updatedAt: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("[admin.account-deletion] Failed to mark requests viewed.", error);
    return NextResponse.json(
      {
        code: "bad_request:account_deletion_mark_viewed",
        message: "Unable to mark account deletion requests as viewed.",
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
