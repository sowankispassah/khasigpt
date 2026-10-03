import { type NextRequest, NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/api/cache";
import {
  createAuditLogEntry,
  deleteUsersForAdmin,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";
export const maxDuration = 30;

const ADMIN_BULK_USER_DELETE_TIMEOUT_MS = 25_000;
const ADMIN_BULK_USER_DELETE_AUDIT_TIMEOUT_MS = 3_000;
const MAX_BULK_USER_DELETE_COUNT = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUserId(value: string) {
  return UUID_PATTERN.test(value);
}

function bulkUserDeleteErrorMessage(error: unknown) {
  if (error instanceof ChatSDKError) {
    return error.cause ?? error.message;
  }

  if (error instanceof Error && error.message === "timeout") {
    return "Bulk user deletion timed out. Refresh the list before retrying.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to delete selected users.";
}

export async function DELETE(request: NextRequest) {
  const actor = await requireAdminApiUser(request);
  if (!actor) {
    return NextResponse.json(
      { error: "forbidden" },
      { headers: noStoreHeaders(), status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "invalid_payload" },
      { headers: noStoreHeaders(), status: 400 }
    );
  }

  const input = body as {
    confirmation?: unknown;
    mode?: unknown;
    userIds?: unknown;
  };
  const mode =
    input.mode === "soft" || input.mode === "permanent" ? input.mode : null;
  const rawUserIds = Array.isArray(input.userIds) ? input.userIds : [];
  const allUserIdsAreStrings = rawUserIds.every(
    (value): value is string => typeof value === "string"
  );
  const userIds = Array.from(
    new Set(allUserIdsAreStrings ? rawUserIds : [])
  );

  if (!mode) {
    return NextResponse.json(
      { error: "invalid_delete_mode" },
      { headers: noStoreHeaders(), status: 400 }
    );
  }

  if (
    userIds.length === 0 ||
    !allUserIdsAreStrings ||
    rawUserIds.length > MAX_BULK_USER_DELETE_COUNT ||
    userIds.length > MAX_BULK_USER_DELETE_COUNT ||
    userIds.some((userId) => !isValidUserId(userId))
  ) {
    return NextResponse.json(
      { error: "invalid_user_ids" },
      { headers: noStoreHeaders(), status: 400 }
    );
  }

  if (userIds.includes(actor.id)) {
    return NextResponse.json(
      { error: "self_delete_not_allowed" },
      { headers: noStoreHeaders(), status: 400 }
    );
  }

  if (mode === "permanent" && input.confirmation !== "PERMANENT_DELETE") {
    return NextResponse.json(
      { error: "permanent_delete_confirmation_required" },
      { headers: noStoreHeaders(), status: 400 }
    );
  }

  try {
    const result = await withTimeout(
      deleteUsersForAdmin({ ids: userIds, mode }),
      ADMIN_BULK_USER_DELETE_TIMEOUT_MS,
      () => {
        console.error(
          `[api/admin/users/bulk] ${mode} deletion timed out for ${userIds.length} users.`,
          { timeoutMs: ADMIN_BULK_USER_DELETE_TIMEOUT_MS }
        );
      }
    );

    if (result.userIds.length === 0) {
      return NextResponse.json(
        { error: "not_found" },
        { headers: noStoreHeaders(), status: 404 }
      );
    }

    void withTimeout(
      createAuditLogEntry({
        actorId: actor.id,
        action:
          mode === "soft"
            ? "user.bulk_soft_delete"
            : "user.bulk_permanent_delete",
        target:
          mode === "soft"
            ? { userIds: result.userIds }
            : { deletedUserIds: result.userIds },
        metadata: { count: result.userIds.length, mode },
      }),
      ADMIN_BULK_USER_DELETE_AUDIT_TIMEOUT_MS
    ).catch((error) => {
      console.error(
        `[api/admin/users/bulk] Audit log write failed for ${mode} deletion.`,
        error
      );
    });

    return NextResponse.json(
      { deletedCount: result.userIds.length, mode, ok: true },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    console.error(
      `[api/admin/users/bulk] Failed to ${mode}-delete selected users.`,
      error
    );
    return NextResponse.json(
      {
        error: "delete_failed",
        message: bulkUserDeleteErrorMessage(error),
      },
      { headers: noStoreHeaders(), status: 500 }
    );
  }
}
