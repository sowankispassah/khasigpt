import type { Metadata } from "next";
import { ContactMessagesPage } from "@/components/admin/contact-messages-page";
import { requireAdminPageSession } from "@/lib/security/admin-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chat Reports",
  description: "Review AI response feedback and forum safety reports.",
};

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPageSession();
  return <ContactMessagesPage kind="report" searchParams={searchParams} />;
}
