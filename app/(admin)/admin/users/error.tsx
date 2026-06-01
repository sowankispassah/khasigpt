"use client";

import { AdminSectionError } from "@/components/admin/admin-section-error";

export default function AdminUsersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <AdminSectionError error={error} reset={reset} sectionName="Users" />;
}
