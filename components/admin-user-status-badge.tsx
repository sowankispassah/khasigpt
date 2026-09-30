"use client";

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
  const classes = {
    active: "bg-emerald-100 text-emerald-700",
    not_verified: "bg-amber-100 text-amber-800",
    online: "bg-sky-100 text-sky-700",
    suspended: "bg-rose-100 text-rose-700",
  }[status];
  const labels = {
    active: { text: "Active", description: "Status badge for an active admin user account." },
    not_verified: { text: "Not verified", description: "Status badge for an account awaiting email verification." },
    online: { text: "Online", description: "Status badge for an admin user who has sent a recent presence heartbeat." },
    suspended: { text: "Suspended", description: "Status badge for a suspended admin user account." },
  }[status];

  return (
    <span className={`rounded-full px-2 py-1 text-xs ${classes}`}>
      <EditableTranslation
        defaultText={labels.text}
        description={labels.description}
        translationKey={`admin.users.status.${status}`}
      />
    </span>
  );
}
