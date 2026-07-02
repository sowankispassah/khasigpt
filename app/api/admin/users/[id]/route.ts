import { type NextRequest, NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/api/cache";
import {
  createAuditLogEntry,
  updateUserActiveState,
  updateUserPersonalKnowledgePermission,
  updateUserRole,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";
export const maxDuration = 30;

const ADMIN_USER_UPDATE_TIMEOUT_MS = 8_000;
const ADMIN_USER_UPDATE_AUDIT_TIMEOUT_MS = 3_000;
const USER_ROLES = new Set(["admin", "creator", "regular"]);

function userUpdateErrorMessage(error: unknown) {
  if (error instanceof ChatSDKError) {
    return error.cause ?? error.message;
  }

  if (error instanceof Error && error.message === "timeout") {
    return "User update timed out. Please refresh this user row before retrying.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to update user.";
}

function boolOrNull(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await requireAdminApiUser(request);
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id: userId } = await params;
  if (!userId) {
    return NextResponse.json({ error: "missing_user_id" }, { status: 400 });
  }

  if (actor.id === userId) {
    return NextResponse.json(
      { error: "self_update_not_allowed" },
      { headers: noStoreHeaders(), status: 400 }
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
    allowPersonalKnowledge?: unknown;
    isActive?: unknown;
    role?: unknown;
  };
  const requestedFields = [
    input.role !== undefined,
    input.isActive !== undefined,
    input.allowPersonalKnowledge !== undefined,
  ].filter(Boolean).length;

  if (requestedFields !== 1) {
    return NextResponse.json(
      { error: "exactly_one_update_required" },
      { headers: noStoreHeaders(), status: 400 }
    );
  }

  try {
    if (input.role !== undefined) {
      const role = typeof input.role === "string" ? input.role : "";
      if (!USER_ROLES.has(role)) {
        return NextResponse.json(
          { error: "invalid_role" },
          { headers: noStoreHeaders(), status: 400 }
        );
      }

      const updated = await withTimeout(
        updateUserRole({
          id: userId,
          role: role as "admin" | "creator" | "regular",
        }),
        ADMIN_USER_UPDATE_TIMEOUT_MS,
        () => {
          console.error(
            `[api/admin/users] Role update timed out for user "${userId}".`,
            { timeoutMs: ADMIN_USER_UPDATE_TIMEOUT_MS }
          );
        }
      );
      if (!updated) {
        return NextResponse.json(
          { error: "not_found" },
          { headers: noStoreHeaders(), status: 404 }
        );
      }

      void withTimeout(
        createAuditLogEntry({
          actorId: actor.id,
          action: "user.role.update",
          target: { userId },
          metadata: { role },
        }),
        ADMIN_USER_UPDATE_AUDIT_TIMEOUT_MS
      ).catch((error) => {
        console.error(
          `[api/admin/users] Audit log write failed for role update "${userId}".`,
          error
        );
      });

      return NextResponse.json(
        { ok: true, user: updated },
        { headers: noStoreHeaders() }
      );
    }

    if (input.isActive !== undefined) {
      const isActive = boolOrNull(input.isActive);
      if (isActive === null) {
        return NextResponse.json(
          { error: "invalid_active_state" },
          { headers: noStoreHeaders(), status: 400 }
        );
      }

      const updated = await withTimeout(
        updateUserActiveState({ id: userId, isActive }),
        ADMIN_USER_UPDATE_TIMEOUT_MS,
        () => {
          console.error(
            `[api/admin/users] Active-state update timed out for user "${userId}".`,
            { timeoutMs: ADMIN_USER_UPDATE_TIMEOUT_MS }
          );
        }
      );
      if (!updated) {
        return NextResponse.json(
          { error: "not_found" },
          { headers: noStoreHeaders(), status: 404 }
        );
      }

      void withTimeout(
        createAuditLogEntry({
          actorId: actor.id,
          action: "user.active.update",
          target: { userId },
          metadata: { isActive },
        }),
        ADMIN_USER_UPDATE_AUDIT_TIMEOUT_MS
      ).catch((error) => {
        console.error(
          `[api/admin/users] Audit log write failed for active-state update "${userId}".`,
          error
        );
      });

      return NextResponse.json(
        { ok: true, user: updated },
        { headers: noStoreHeaders() }
      );
    }

    const allowPersonalKnowledge = boolOrNull(input.allowPersonalKnowledge);
    if (allowPersonalKnowledge === null) {
      return NextResponse.json(
        { error: "invalid_personal_knowledge_state" },
        { headers: noStoreHeaders(), status: 400 }
      );
    }

    const updated = await withTimeout(
      updateUserPersonalKnowledgePermission({
        allowPersonalKnowledge,
        id: userId,
      }),
      ADMIN_USER_UPDATE_TIMEOUT_MS,
      () => {
        console.error(
          `[api/admin/users] Personal-knowledge update timed out for user "${userId}".`,
          { timeoutMs: ADMIN_USER_UPDATE_TIMEOUT_MS }
        );
      }
    );
    if (!updated) {
      return NextResponse.json(
        { error: "not_found" },
        { headers: noStoreHeaders(), status: 404 }
      );
    }

    void withTimeout(
      createAuditLogEntry({
        actorId: actor.id,
        action: "user.personal_knowledge.toggle",
        target: { userId },
        metadata: { allowed: allowPersonalKnowledge },
      }),
      ADMIN_USER_UPDATE_AUDIT_TIMEOUT_MS
    ).catch((error) => {
      console.error(
        `[api/admin/users] Audit log write failed for personal-knowledge update "${userId}".`,
        error
      );
    });

    return NextResponse.json(
      { ok: true, user: updated },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    console.error(
      `[api/admin/users] Failed to update user "${userId}".`,
      error
    );
    return NextResponse.json(
      {
        error: "update_failed",
        message: userUpdateErrorMessage(error),
      },
      { headers: noStoreHeaders(), status: 500 }
    );
  }
}
