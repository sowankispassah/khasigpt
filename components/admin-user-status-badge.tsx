"use client";

import { AdminStatusPill, type AdminStatusTone } from "@/components/admin/admin-ui";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { getAdminUserStatus } from "@/lib/admin/user-account-status";

export function AdminUserStatusBadge({
  emailVerificationPending,
  isActive,
  isOnline,
}: {
  emailVerificationPending: boolean;
  isActive: boolean;
  isOnline: boolean;
}) {
  const status = getAdminUserStatus({ emailVerificationPending, isActive, isOnline });
  const tone: AdminStatusTone = {
    active: "success" as const,
    not_verified: "warning" as const,
    online: "info" as const,
    suspended: "danger" as const,
  }[status];
  const labels = {
    active: { text: "Active", description: "Status badge for an active admin user account." },
    not_verified: { text: "Not verified", description: "Status badge for an account awaiting email verification." },
    online: { text: "Online", description: "Status badge for an admin user who has sent a recent presence heartbeat." },
    suspended: { text: "Suspended", description: "Status badge for a suspended admin user account." },
  }[status];

  return (
    <AdminStatusPill tone={tone}>
      <EditableTranslation
        defaultText={labels.text}
        description={labels.description}
        translationKey={`admin.users.status.${status}`}
      />
    </AdminStatusPill>
  );
}
