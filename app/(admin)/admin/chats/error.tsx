"use client";

import { AdminSectionError } from "@/components/admin/admin-section-error";

export default function AdminChatsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <AdminSectionError error={error} reset={reset} sectionName="Chats" />;
}
