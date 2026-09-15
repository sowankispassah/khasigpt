import { type NextRequest, NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/api/cache";
import {
  createAuditLogEntry,
  deleteUserForAdmin,
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
const ADMIN_USER_DELETE_TIMEOUT_MS = 20_000;
const ADMIN_USER_DELETE_AUDIT_TIMEOUT_MS = 3_000;
const USER_ROLES = new Set(["admin", "creator", "regular"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function isValidUserId(value: string) {
  return UUID_PATTERN.test(value);
}

function userDeleteErrorMessage(error: unknown) {
  if (error instanceof ChatSDKError) {
    return error.cause ?? error.message;
  }

  if (error instanceof Error && error.message === "timeout") {
    return "User deletion timed out. Refresh the list before retrying.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to delete user.";
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await requireAdminApiUser(request);
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id: userId } = await params;
  if (!userId || !isValidUserId(userId)) {
    return NextResponse.json(
      { error: "invalid_user_id" },
      { headers: noStoreHeaders(), status: 400 }
    );
  }

  if (actor.id === userId) {
    return NextResponse.json(
      { error: "self_delete_not_allowed" },
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

  const input = body as { confirmation?: unknown; mode?: unknown };
  const mode = input.mode === "soft" || input.mode === "permanent"
    ? input.mode
    : null;
  if (!mode) {
    return NextResponse.json(
      { error: "invalid_delete_mode" },
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
      deleteUserForAdmin({ id: userId, mode }),
      ADMIN_USER_DELETE_TIMEOUT_MS,
      () => {
        console.error(
          `[api/admin/users] ${mode} deletion timed out for user "${userId}".`,
          { timeoutMs: ADMIN_USER_DELETE_TIMEOUT_MS }
        );
      }
    );

    if (!result) {
      return NextResponse.json(
        { error: "not_found" },
        { headers: noStoreHeaders(), status: 404 }
      );
    }

    void withTimeout(
      createAuditLogEntry({
        actorId: actor.id,
        action:
          mode === "soft" ? "user.soft_delete" : "user.permanent_delete",
        target:
          mode === "soft"
            ? { userId }
            : { deletedUserId: userId },
        metadata: { mode },
      }),
      ADMIN_USER_DELETE_AUDIT_TIMEOUT_MS
    ).catch((error) => {
      console.error(
        `[api/admin/users] Audit log write failed for ${mode} deletion "${userId}".`,
        error
      );
    });

    return NextResponse.json(
      { mode, ok: true },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    console.error(
      `[api/admin/users] Failed to ${mode}-delete user "${userId}".`,
      error
    );
    return NextResponse.json(
      {
        error: "delete_failed",
        message: userDeleteErrorMessage(error),
      },
      { headers: noStoreHeaders(), status: 500 }
    );
  }
}
