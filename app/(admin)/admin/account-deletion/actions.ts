"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import {
  createAuditLogEntry,
  markAccountDeletionRequestsViewed,
  updateAccountDeletionRequestStatus,
} from "@/lib/db/queries";
import type { AccountDeletionRequestStatus } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { getClientInfoFromHeaders } from "@/lib/security/client-info";

const VALID_STATUSES = new Set<AccountDeletionRequestStatus>([
  "pending",
  "under_review",
  "approved",
  "completed",
  "rejected",
]);

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    redirect("/");
  }
  return session;
}

function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function updateDeletionRequestStatusAction(formData: FormData) {
  const session = await requireAdmin();
  const id = textValue(formData, "requestId");
  const statusValue = textValue(formData, "status");
  const internalNotes = textValue(formData, "internalNotes");
  const status = VALID_STATUSES.has(statusValue as AccountDeletionRequestStatus)
    ? (statusValue as AccountDeletionRequestStatus)
    : null;

  if (!id || !status) {
    redirect("/admin/account-deletion?notice=invalid");
  }

  let notice = "updated";

  try {
    const clientInfo = await getClientInfoFromHeaders();
    const updated = await updateAccountDeletionRequestStatus({
      id,
      status,
      adminUserId: session.user.id,
      internalNotes,
      clientInfo,
    });

    if (!updated) {
      notice = "not-found";
    } else {
      await createAuditLogEntry({
        actorId: session.user.id,
        action: "admin.account_deletion.status_update",
        target: {
          requestId: id,
          referenceId: updated.referenceId,
          status,
          userId: updated.userId,
        },
        subjectUserId: updated.userId,
        metadata: {
          internalNotes: internalNotes ? "provided" : "empty",
        },
        ...clientInfo,
      });

      revalidatePath("/admin/account-deletion");
    }
  } catch (error) {
    notice =
      error instanceof ChatSDKError &&
      String(error.cause ?? "").includes("must be verified")
        ? "requires-verification"
        : "error";
  }

  redirect(`/admin/account-deletion?notice=${notice}`);
}

export async function markDeletionRequestViewedAction(formData: FormData) {
  const session = await requireAdmin();
  const id = textValue(formData, "requestId");

  if (!id) {
    redirect("/admin/account-deletion?notice=invalid");
  }

  let notice = "updated";

  try {
    const clientInfo = await getClientInfoFromHeaders();
    const result = await markAccountDeletionRequestsViewed({
      adminUserId: session.user.id,
      clientInfo,
      requestIds: [id],
    });

    if (result.markedCount > 0) {
      await createAuditLogEntry({
        actorId: session.user.id,
        action: "admin.account_deletion.mark_viewed",
        target: {
          requestId: id,
        },
        metadata: {
          markedCount: result.markedCount,
        },
        ...clientInfo,
      });
    }

    revalidatePath("/admin/account-deletion");
  } catch {
    notice = "error";
  }

  redirect(`/admin/account-deletion?notice=${notice}`);
}
