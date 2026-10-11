import type { Metadata } from "next";
import { ContactMessagesPage } from "@/components/admin/contact-messages-page";
import { requireAdminPageSession } from "@/lib/security/admin-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact Requests",
  description: "Review messages submitted through the contact form.",
};

export default async function AdminContactsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPageSession();
  return <ContactMessagesPage kind="contact" searchParams={searchParams} />;
}
