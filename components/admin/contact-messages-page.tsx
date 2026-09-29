import { AdminPagination } from "@/components/admin/admin-pagination";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { toContactTableMessage } from "@/lib/admin/contact-table-message";
import { adminQueryResult } from "@/lib/admin/safe-query";
import {
  getContactMessageCount,
  listContactMessages,
} from "@/lib/db/queries";
import type { ContactMessage } from "@/lib/db/schema";
import { ContactMessagesTable } from "./contact-messages-table";
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

  const offset = (requestedPage - 1) * CONTACTS_PAGE_SIZE;
  const [messagesState, totalMessagesState] = await Promise.all([
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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl">{kind === "report" ? <EditableTranslation defaultText="Reports" description="Admin reports page title." translationKey="admin.reports.title" /> : <EditableTranslation defaultText="Contact requests" description="Admin contact requests page title." translationKey="admin.contacts.title" />}</h1>
        <p className="text-muted-foreground text-sm">
          {kind === "report" ? <EditableTranslation defaultText="AI response and forum reports submitted by users." description="Admin reports page description." translationKey="admin.reports.description" /> : <EditableTranslation defaultText="Messages from people who want to get in touch." description="Admin contact requests page description." translationKey="admin.contacts.description" />}
        </p>
      </header>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        {kind === "contact" && (!messagesConfirmed || !totalMessagesState.ok) && (
          <AdminContactsWarning
            kind={kind}
            countUnavailable={!totalMessagesState.ok}
            rowsUnavailable={!messagesConfirmed}
          />
        )}
        {kind === "report" ? (
          <ReportsWorkspace initialRows={messages.map(toContactTableMessage)} initialTotal={totalMessages} initialConfirmed={messagesConfirmed && totalMessagesState.ok} initialPage={page} />
        ) : <ContactMessagesTable kind={kind} messages={messages.map(toContactTableMessage)} messagesConfirmed={messagesConfirmed} />}

        {kind === "contact" ? <div className="mt-4">
          <AdminPagination
            itemLabel={<EditableTranslation defaultText="contact requests" description="Contact list pagination item name." translationKey="admin.contacts.pagination_item" />}
            page={page}
            pageSize={CONTACTS_PAGE_SIZE}
            pathname="/admin/contacts"
            searchParams={resolvedSearchParams}
            totalItems={totalMessagesState.ok ? totalMessages : messages.length}
          />
        </div> : null}
      </section>
    </div>
  );
}

function AdminContactsWarning({
  kind,
  rowsUnavailable,
  countUnavailable,
}: {
  kind: ContactMessage["kind"];
  rowsUnavailable: boolean;
  countUnavailable: boolean;
}) {
  return (
    <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-sm">
      {rowsUnavailable ? <>{kind === "report" ? <EditableTranslation defaultText="Report rows could not be confirmed." description="Report list rows unavailable warning." translationKey="admin.reports.rows_unavailable" /> : <EditableTranslation defaultText="Contact request rows could not be confirmed." description="Contact list rows unavailable warning." translationKey="admin.contacts.rows_unavailable" />}{" "}</> : null}
      {countUnavailable ? <>{kind === "report" ? <EditableTranslation defaultText="Report total could not be confirmed." description="Report list count unavailable warning." translationKey="admin.reports.count_unavailable" /> : <EditableTranslation defaultText="Contact request total could not be confirmed." description="Contact list count unavailable warning." translationKey="admin.contacts.count_unavailable" />}{" "}</> : null}
      <EditableTranslation defaultText="Refresh this admin section to retry." description="Contact list recovery instruction." translationKey="admin.contacts.retry_instruction" />
    </div>
  );
}
