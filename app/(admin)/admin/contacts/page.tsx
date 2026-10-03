import type { Metadata } from "next";
import { ContactMessagesPage } from "@/components/admin/contact-messages-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact Requests",
  description: "Review messages submitted through the contact form.",
};

export default function AdminContactsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ContactMessagesPage kind="contact" searchParams={searchParams} />;
}
