import type { Metadata } from "next";
import { ContactMessagesPage } from "@/components/admin/contact-messages-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chat Reports",
  description: "Review AI response feedback and forum safety reports.",
};

export default function AdminReportsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ContactMessagesPage kind="report" searchParams={searchParams} />;
}
