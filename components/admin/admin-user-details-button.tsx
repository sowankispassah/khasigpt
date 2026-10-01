"use client";

import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { UserUpdatePayload } from "@/components/admin-user-actions-menu";
import { EditableTranslation } from "@/components/translation-edit-provider";

const UserDetailsDialog = dynamic(() => import("./admin-user-details-dialog"), {
  ssr: false,
  loading: () => (
    <output className="inline-flex items-center gap-1 text-muted-foreground text-xs">
      <Loader2 aria-hidden="true" className="size-3 animate-spin" />
      <EditableTranslation
        defaultText="Loading user details..."
        description="User details dialog loading."
        translationKey="admin.users.details.loading"
      />
    </output>
  ),
});

export function AdminUserDetailsButton({
  userId,
  email,
  onUpdated,
}: {
  userId: string;
  email: string;
  onUpdated?: (patch: UserUpdatePayload) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="cursor-pointer break-all text-left text-primary underline-offset-2 hover:underline"
        onClick={() => setOpen(true)}
        type="button"
      >
        {email}
      </button>
      {open ? (
        <UserDetailsDialog
          email={email}
          onClose={() => setOpen(false)}
          onUpdated={onUpdated}
          userId={userId}
        />
      ) : null}
    </>
  );
}
