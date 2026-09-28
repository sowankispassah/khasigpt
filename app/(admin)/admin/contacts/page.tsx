import { formatDistanceToNow } from "date-fns";
import type { Metadata } from "next";

import { AdminPagination } from "@/components/admin/admin-pagination";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { adminQueryResult } from "@/lib/admin/safe-query";
import {
  getContactMessageCount,
  listContactMessages,
} from "@/lib/db/queries";
import type { ContactMessage } from "@/lib/db/schema";
import { ContactMessagesTable, type ContactTableMessage } from "./contact-messages-table";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact Requests",
  description: "Review messages submitted through the contact form.",
};

const CONTACTS_PAGE_SIZE = 25;
const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

function toTableMessage(message: ContactMessage): ContactTableMessage {
  const createdAt = new Date(message.createdAt ?? Number.NaN);
  const updatedAt = new Date(message.updatedAt ?? Number.NaN);
  const validCreatedAt = Number.isFinite(createdAt.getTime());
  return {
    ...message,
    message: typeof message.message === "string" ? message.message : "",
    createdAt: validCreatedAt ? createdAt.toISOString() : "",
    receivedAt: validCreatedAt ? `${dateFormatter.format(createdAt)} IST` : "—",
    receivedRelative: validCreatedAt
      ? formatDistanceToNow(createdAt, { addSuffix: true })
      : "—",
    updatedAt: Number.isFinite(updatedAt.getTime()) ? updatedAt.toISOString() : "",
    updatedAtLabel: Number.isFinite(updatedAt.getTime())
      ? `${dateFormatter.format(updatedAt)} IST`
      : "—",
  };
}

function parsePage(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(rawValue ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function AdminContactsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedPage = parsePage(resolvedSearchParams?.page);

  const offset = (requestedPage - 1) * CONTACTS_PAGE_SIZE;
  const [messagesState, totalMessagesState] = await Promise.all([
    adminQueryResult({
      fallback: [] as ContactMessage[],
      label: "contacts.messages",
      promise: listContactMessages({
        limit: CONTACTS_PAGE_SIZE,
        offset,
      }),
    }),
    adminQueryResult({
      fallback: 0,
      label: "contacts.count",
      promise: getContactMessageCount(),
    }),
  ]);

  const totalMessages = totalMessagesState.data;
  const totalPages = totalMessagesState.ok
    ? Math.max(1, Math.ceil(totalMessages / CONTACTS_PAGE_SIZE))
    : requestedPage;
  const page = totalMessagesState.ok
    ? Math.min(requestedPage, totalPages)
    : requestedPage;
  const correctedMessagesState =
    page !== requestedPage && messagesState.ok
      ? await adminQueryResult({
          fallback: [] as ContactMessage[],
          label: "contacts.corrected-page",
          promise: listContactMessages({
            limit: CONTACTS_PAGE_SIZE,
            offset: (page - 1) * CONTACTS_PAGE_SIZE,
          }),
        })
      : messagesState;
  const messages = correctedMessagesState.data;
  const messagesConfirmed = correctedMessagesState.ok;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl"><EditableTranslation defaultText="Contact requests" description="Admin contact requests page title." translationKey="admin.contacts.title" /></h1>
        <p className="text-muted-foreground text-sm">
          <EditableTranslation defaultText="Messages and AI feedback submitted by users." description="Admin contact requests page description." translationKey="admin.contacts.description" />
        </p>
      </header>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        {(!messagesConfirmed || !totalMessagesState.ok) && (
          <AdminContactsWarning
            countUnavailable={!totalMessagesState.ok}
            rowsUnavailable={!messagesConfirmed}
          />
        )}
        <ContactMessagesTable messages={messages.map(toTableMessage)} messagesConfirmed={messagesConfirmed} />

        <div className="mt-4">
          <AdminPagination
            itemLabel="contact requests"
            page={page}
            pageSize={CONTACTS_PAGE_SIZE}
            pathname="/admin/contacts"
            searchParams={resolvedSearchParams}
            totalItems={totalMessagesState.ok ? totalMessages : messages.length}
          />
        </div>
      </section>
    </div>
  );
}

function AdminContactsWarning({
  rowsUnavailable,
  countUnavailable,
}: {
  rowsUnavailable: boolean;
  countUnavailable: boolean;
}) {
  return (
    <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-sm">
      {rowsUnavailable ? <><EditableTranslation defaultText="Contact request rows could not be confirmed." description="Contact list rows unavailable warning." translationKey="admin.contacts.rows_unavailable" />{" "}</> : null}
      {countUnavailable ? <><EditableTranslation defaultText="Contact request total could not be confirmed." description="Contact list count unavailable warning." translationKey="admin.contacts.count_unavailable" />{" "}</> : null}
      <EditableTranslation defaultText="Refresh this admin section to retry." description="Contact list recovery instruction." translationKey="admin.contacts.retry_instruction" />
    </div>
  );
}
