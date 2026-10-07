import type { ReactNode } from "react";
import { z } from "zod";
import { AdminPagination } from "@/components/admin/admin-pagination";
import {
  AdminNotice,
  AdminPageHeader,
  AdminStatusPill,
} from "@/components/admin/admin-ui";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { toContactTableMessage } from "@/lib/admin/contact-table-message";
import { adminQueryResult } from "@/lib/admin/safe-query";
import { getAdminContactById } from "@/lib/db/admin-user-details";
import { listLatestInboundContactEmails } from "@/lib/db/contact-replies";
import {
  getContactMessageCount,
  listContactMessages,
} from "@/lib/db/queries";
import type { ContactMessage } from "@/lib/db/schema";
import { contactInboundConfigured } from "@/lib/email/contact-inbound";
import { ContactMessagesTable, type ContactTableMessage } from "./contact-messages-table";
import { ReportsWorkspace } from "./reports-workspace";

const CONTACTS_PAGE_SIZE = 25;
function parsePage(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(rawValue ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export async function ContactMessagesPage({
  kind,
  searchParams,
}: {
  kind: ContactMessage["kind"];
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedPage = parsePage(resolvedSearchParams?.page);

  const contactParam = resolvedSearchParams?.contact;
  const contactId = kind === "contact" ? z.string().uuid().safeParse(Array.isArray(contactParam) ? contactParam[0] : contactParam) : null;
  const selectedContactPromise = contactId?.success ? adminQueryResult({ fallback: null, label: "contacts.selected", promise: getAdminContactById(contactId.data) }) : Promise.resolve(null);
  const offset = (requestedPage - 1) * CONTACTS_PAGE_SIZE;
  const [messagesState, totalMessagesState, selectedContactState] = await Promise.all([
    adminQueryResult({
      fallback: [] as ContactMessage[],
      label: `${kind}.messages`,
      promise: listContactMessages({
        kind,
        limit: CONTACTS_PAGE_SIZE,
        offset,
      }),
    }),
    adminQueryResult({
      fallback: 0,
      label: `${kind}.count`,
      promise: getContactMessageCount({ kind }),
    }),
    selectedContactPromise,
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
          label: `${kind}.corrected-page`,
          promise: listContactMessages({
            kind,
            limit: CONTACTS_PAGE_SIZE,
            offset: (page - 1) * CONTACTS_PAGE_SIZE,
          }),
        })
      : messagesState;
  const messages = correctedMessagesState.data;
  const messagesConfirmed = correctedMessagesState.ok;
  const repliedMessageIds = kind === "contact"
    ? messages.filter((message) => message.lastInboundAt).map((message) => message.id)
    : [];
  const latestInboundState = repliedMessageIds.length > 0
    ? await adminQueryResult({
        fallback: [] as Awaited<ReturnType<typeof listLatestInboundContactEmails>>,
        label: "contacts.latest-inbound",
        promise: listLatestInboundContactEmails(repliedMessageIds),
        timeoutMs: 1500,
      })
    : null;
  const latestInboundByMessage = new Map(latestInboundState?.data.map((email) => [email.messageId, email.body]) ?? []);

  return (
    <ContactMessagesView
      countConfirmed={totalMessagesState.ok}
      inboundConfigured={contactInboundConfigured()}
      initialContact={selectedContactState?.data ? toContactTableMessage(selectedContactState.data) : undefined}
      kind={kind}
      messages={messages.map((message) => ({
        ...toContactTableMessage(message),
        latestInboundPreview: kind === "contact" ? latestInboundByMessage.get(message.id) ?? null : undefined,
      }))}
      messagesConfirmed={messagesConfirmed}
      page={page}
      pagination={
        kind === "contact" ? (
          <AdminPagination
            itemLabel={<EditableTranslation defaultText="contact requests" description="Contact list pagination item name." translationKey="admin.contacts.pagination_item" />}
            page={page}
            pageSize={CONTACTS_PAGE_SIZE}
            pathname="/admin/contacts"
            searchParams={resolvedSearchParams}
            totalItems={totalMessagesState.ok ? totalMessages : messages.length}
          />
        ) : null
      }
      selectedContactUnavailable={
        kind === "contact" &&
        contactParam !== undefined &&
        (!contactId?.success || !selectedContactState?.ok || !selectedContactState.data)
      }
      totalMessages={totalMessages}
    />
  );
}

/**
 * Presentational shell for the contact and report inboxes. Data loading stays
 * in ContactMessagesPage so this can render from plain props.
 */
export function ContactMessagesView({
  countConfirmed,
  inboundConfigured,
  initialContact,
  kind,
  messages,
  messagesConfirmed,
  page,
  pagination,
  selectedContactUnavailable,
  totalMessages,
}: {
  countConfirmed: boolean;
  inboundConfigured: boolean;
  initialContact?: ContactTableMessage;
  kind: ContactMessage["kind"];
  messages: ContactTableMessage[];
  messagesConfirmed: boolean;
  page: number;
  pagination: ReactNode;
  selectedContactUnavailable: boolean;
  totalMessages: number;
}) {
  const isReport = kind === "report";
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        description={isReport ? <EditableTranslation defaultText="AI response and forum reports submitted by users." description="Admin reports page description." translationKey="admin.reports.description" /> : <EditableTranslation defaultText="Messages from people who want to get in touch." description="Admin contact requests page description." translationKey="admin.contacts.description" />}
        meta={!isReport && countConfirmed ? (
          <AdminStatusPill>
            <EditableTranslation
              defaultText="{count} total"
              description="Total contact requests shown beside the contact requests page title."
              translationKey="admin.contacts.total_count"
              values={{ count: totalMessages.toLocaleString("en-IN") }}
            />
          </AdminStatusPill>
        ) : null}
        navHref={isReport ? "/admin/reports" : "/admin/contacts"}
        title={isReport ? <EditableTranslation defaultText="Reports" description="Admin reports page title." translationKey="admin.reports.title" /> : <EditableTranslation defaultText="Contact requests" description="Admin contact requests page title." translationKey="admin.contacts.title" />}
      />

      {isReport ? (
        <ReportsWorkspace initialConfirmed={messagesConfirmed && countConfirmed} initialPage={page} initialRows={messages} initialTotal={totalMessages} />
      ) : (
        <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
          {selectedContactUnavailable || !messagesConfirmed || !countConfirmed ? (
            <div className="space-y-2 border-b px-4 py-3">
              {selectedContactUnavailable ? (
                <AdminNotice tone="danger">
                  <EditableTranslation defaultText="The selected support request could not be opened. It may no longer exist; refresh this section to retry." description="Selected support conversation unavailable." translationKey="admin.users.details.support_target_error" />
                </AdminNotice>
              ) : null}
              {!messagesConfirmed || !countConfirmed ? (
                <AdminContactsWarning countUnavailable={!countConfirmed} rowsUnavailable={!messagesConfirmed} />
              ) : null}
            </div>
          ) : null}
          <ContactMessagesTable
            inboundConfigured={inboundConfigured}
            initialContact={initialContact}
            kind={kind}
            messages={messages}
            messagesConfirmed={messagesConfirmed}
          />
          {pagination ? <div className="border-t px-4 py-3">{pagination}</div> : null}
        </section>
      )}
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
    <AdminNotice>
      {rowsUnavailable ? <><EditableTranslation defaultText="Contact request rows could not be confirmed." description="Contact list rows unavailable warning." translationKey="admin.contacts.rows_unavailable" />{" "}</> : null}
      {countUnavailable ? <><EditableTranslation defaultText="Contact request total could not be confirmed." description="Contact list count unavailable warning." translationKey="admin.contacts.count_unavailable" />{" "}</> : null}
      <EditableTranslation defaultText="Refresh this admin section to retry." description="Contact list recovery instruction." translationKey="admin.contacts.retry_instruction" />
    </AdminNotice>
  );
}
