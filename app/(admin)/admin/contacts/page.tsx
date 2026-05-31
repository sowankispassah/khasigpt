import { formatDistanceToNow } from "date-fns";
import type { Metadata } from "next";

import { AdminPagination } from "@/components/admin/admin-pagination";
import { adminQueryResult } from "@/lib/admin/safe-query";
import {
  getContactMessageCount,
  listContactMessages,
} from "@/lib/db/queries";
import type { ContactMessage } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contact Requests",
  description: "Review messages submitted through the contact form.",
};

const CONTACTS_PAGE_SIZE = 25;

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
        <h1 className="font-semibold text-2xl">Contact requests</h1>
        <p className="text-muted-foreground text-sm">
          Messages submitted through the public contact form.
        </p>
      </header>

      <section className="rounded-lg border bg-card p-4 shadow-sm">
        {(!messagesConfirmed || !totalMessagesState.ok) && (
          <AdminContactsWarning
            message={[
              !messagesConfirmed
                ? "Contact request rows could not be confirmed."
                : null,
              !totalMessagesState.ok
                ? "Contact request total could not be confirmed."
                : null,
            ]
              .filter(Boolean)
              .join(" ")}
          />
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase">
              <tr>
                <th className="py-2 text-left">From</th>
                <th className="py-2 text-left">Phone</th>
                <th className="py-2 text-left">Subject</th>
                <th className="py-2 text-left">Received</th>
                <th className="py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {!messagesConfirmed ? (
                <tr>
                  <td
                    className="py-8 text-center text-muted-foreground"
                    colSpan={5}
                  >
                    Unable to load contact requests.
                  </td>
                </tr>
              ) : messages.length === 0 ? (
                <tr>
                  <td
                    className="py-8 text-center text-muted-foreground"
                    colSpan={5}
                  >
                    No contact requests yet.
                  </td>
                </tr>
              ) : (
                messages.map((message) => (
                  <tr className="border-t" key={message.id}>
                    <td className="py-3 align-top">
                      <div className="font-medium">{message.name}</div>
                      <a
                        className="cursor-pointer text-muted-foreground text-xs hover:underline"
                        href={`mailto:${message.email}`}
                      >
                        {message.email}
                      </a>
                    </td>
                    <td className="py-3 align-top text-muted-foreground text-xs">
                      {message.phone ? (
                        <a
                          className="cursor-pointer hover:underline"
                          href={`tel:${message.phone}`}
                        >
                          {message.phone}
                        </a>
                      ) : (
                        <span className="text-muted-foreground/70">N/A</span>
                      )}
                    </td>
                    <td className="py-3 align-top">
                      <div className="font-medium">{message.subject}</div>
                      <p className="line-clamp-2 text-muted-foreground text-xs leading-relaxed">
                        {message.message}
                      </p>
                    </td>
                    <td className="py-3 align-top text-muted-foreground">
                      {formatDistanceToNow(new Date(message.createdAt), {
                        addSuffix: true,
                      })}
                    </td>
                    <td className="py-3 align-top capitalize">
                      {message.status.replaceAll("_", " ")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

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

function AdminContactsWarning({ message }: { message: string }) {
  return (
    <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-sm">
      {message} Refresh this admin section to retry.
    </div>
  );
}
