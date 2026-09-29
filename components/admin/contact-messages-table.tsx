"use client";

import { Loader2, MoreVertical } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { summarizeContactMessage } from "@/lib/admin/contact-message-summary";
import type { ContactMessage } from "@/lib/db/schema";

export type ContactTableMessage = Omit<ContactMessage, "createdAt" | "updatedAt"> & {
  createdAt: string;
  receivedAt: string;
  receivedRelative: string;
  updatedAt: string;
  updatedAtLabel: string;
};

const statusLabels = {
  new: { key: "admin.contacts.status.new", text: "New" },
  in_progress: { key: "admin.reports.status.in_review", text: "In review" },
  resolved: { key: "admin.contacts.status.resolved", text: "Resolved" },
  archived: { key: "admin.reports.status.dismissed", text: "Dismissed" },
} as const;

type StatusEvent = {
  id: string;
  fromStatus: ContactMessage["status"];
  toStatus: ContactMessage["status"];
  note: string | null;
  createdAt: string;
  actorFirstName: string | null;
  actorLastName: string | null;
};

type ContactReply = {
  id: string;
  recipientEmail: string;
  subject: string;
  body: string;
  deliveryStatus: "pending" | "sent" | "unconfirmed";
  createdAt: string;
  sentAt: string | null;
  actorFirstName: string | null;
  actorLastName: string | null;
};

function Status({ value }: { value: ContactMessage["status"] }) {
  const label = statusLabels[value] ?? { key: "admin.contacts.status.unknown", text: "Unknown" };
  return (
    <span className="inline-flex rounded-full border bg-muted px-2 py-0.5 text-xs">
      <EditableTranslation
        defaultText={label.text}
        description={`Contact request status: ${label.text}.`}
        translationKey={label.key}
      />
    </span>
  );
}

function Field({
  label,
  translationKey,
  children,
}: {
  label: string;
  translationKey: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">
        <EditableTranslation
          defaultText={label}
          description={`Label for ${label.toLowerCase()} in contact request details.`}
          translationKey={translationKey}
        />
      </dt>
      <dd className="mt-1 break-words text-sm">{children}</dd>
    </div>
  );
}

export function ContactMessagesTable({
  kind,
  messages,
  messagesConfirmed,
  onStatusChanged,
}: {
  kind: ContactMessage["kind"];
  messages: ContactTableMessage[];
  messagesConfirmed: boolean;
  onStatusChanged?: () => void;
}) {
  const { translate } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewedIds, setViewedIds] = useState<Set<string>>(() => new Set());
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [viewErrorId, setViewErrorId] = useState<string | null>(null);
  const [statusMessageId, setStatusMessageId] = useState<string | null>(null);
  const [targetStatus, setTargetStatus] = useState<ContactMessage["status"]>("in_progress");
  const [statusNote, setStatusNote] = useState("");
  const [statusPending, setStatusPending] = useState(false);
  const [statusError, setStatusError] = useState(false);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, ContactMessage["status"]>>({});
  const [history, setHistory] = useState<StatusEvent[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const historyRequest = useRef(0);
  const [replyMessageId, setReplyMessageId] = useState<string | null>(null);
  const [replyRequestId, setReplyRequestId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyPending, setReplyPending] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const [replyError, setReplyError] = useState<"invalid" | "unconfirmed" | null>(null);
  const [replies, setReplies] = useState<ContactReply[]>([]);
  const [repliesBusy, setRepliesBusy] = useState(false);
  const [repliesError, setRepliesError] = useState(false);
  const repliesRequest = useRef(0);
  const effectiveMessages = messages.map((message) => statusOverrides[message.id]
    ? { ...message, status: statusOverrides[message.id] }
    : message);
  const selected = effectiveMessages.find((message) => message.id === selectedId);
  const replyMessage = effectiveMessages.find((message) => message.id === replyMessageId);
  const selectedSummary = selected ? summarizeContactMessage(selected.message) : null;

  async function markViewed(message: ContactTableMessage) {
    if (message.isViewed || viewedIds.has(message.id) || markingId === message.id) {
      return;
    }
    setMarkingId(message.id);
    setViewErrorId(null);
    try {
      const response = await fetch("/api/admin/contact-messages/mark-viewed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: message.id }),
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) {
        throw new Error("Failed to mark message viewed");
      }
      setViewedIds((current) => new Set(current).add(message.id));
      window.dispatchEvent(new Event("admin:contact-unread-counts"));
    } catch (error) {
      console.warn("[admin.contacts] Failed to mark message viewed.", error);
      setViewErrorId(message.id);
    } finally {
      setMarkingId(null);
    }
  }

  function openDetails(message: ContactTableMessage) {
    setSelectedId(message.id);
    void markViewed(message);
    void loadHistory(message.id);
    if (kind === "contact") void loadReplies(message.id);
  }

  async function loadHistory(id: string) {
    const requestId = ++historyRequest.current;
    setHistoryBusy(true);
    setHistoryError(false);
    setHistory([]);
    try {
      const endpoint = kind === "report" ? "/api/admin/reports" : "/api/admin/contact-messages/status";
      const response = await fetch(`${endpoint}?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load history");
      const data = await response.json() as { events: StatusEvent[] };
      if (requestId === historyRequest.current) setHistory(data.events);
    } catch {
      if (requestId === historyRequest.current) setHistoryError(true);
    } finally {
      if (requestId === historyRequest.current) setHistoryBusy(false);
    }
  }

  async function loadReplies(id: string) {
    const requestId = ++repliesRequest.current;
    setRepliesBusy(true);
    setRepliesError(false);
    setReplies([]);
    try {
      const response = await fetch(`/api/admin/contact-messages/replies?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load replies");
      const data = await response.json() as { replies: ContactReply[] };
      if (requestId === repliesRequest.current) setReplies(data.replies);
    } catch {
      if (requestId === repliesRequest.current) setRepliesError(true);
    } finally {
      if (requestId === repliesRequest.current) setRepliesBusy(false);
    }
  }

  function openStatus(message: ContactTableMessage, next?: ContactMessage["status"]) {
    setStatusMessageId(message.id);
    setTargetStatus(next ?? (message.status === "new" ? "in_progress" : message.status));
    setStatusNote("");
    setStatusError(false);
  }

  function openReply(message: ContactTableMessage) {
    setReplyMessageId(message.id);
    setReplyRequestId(crypto.randomUUID());
    setReplyBody("");
    setReplySent(false);
    setReplyError(null);
    void markViewed(message);
  }

  async function submitStatus() {
    if (!statusMessageId || statusPending) return;
    setStatusPending(true);
    setStatusError(false);
    try {
      const response = await fetch(kind === "report" ? "/api/admin/reports" : "/api/admin/contact-messages/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: statusMessageId, status: targetStatus, note: statusNote.trim() }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Unable to update report");
      if (kind === "contact") setStatusOverrides((current) => ({ ...current, [statusMessageId]: targetStatus }));
      setStatusMessageId(null);
      onStatusChanged?.();
      if (selectedId === statusMessageId) void loadHistory(statusMessageId);
    } catch {
      setStatusError(true);
    } finally {
      setStatusPending(false);
    }
  }

  async function submitReply() {
    if (!replyMessageId || !replyRequestId || replyPending || replySent || !replyBody.trim()) return;
    setReplyPending(true);
    setReplyError(null);
    try {
      const response = await fetch("/api/admin/contact-messages/replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: replyMessageId, requestId: replyRequestId, body: replyBody.trim() }),
        cache: "no-store",
      });
      if (response.status === 422 || response.status === 400) {
        setReplyError("invalid");
        return;
      }
      if (!response.ok) throw new Error("Reply delivery unavailable");
      const result = await response.json() as { deliveryStatus: ContactReply["deliveryStatus"] };
      if (result.deliveryStatus === "sent") {
        setReplySent(true);
        if (selectedId === replyMessageId) void loadReplies(replyMessageId);
      } else {
        setReplyError("unconfirmed");
      }
    } catch {
      setReplyError("unconfirmed");
    } finally {
      setReplyPending(false);
    }
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className={`w-full table-fixed text-sm ${kind === "report" ? "min-w-[1320px]" : "min-w-[900px]"}`}>
          <thead className="text-muted-foreground text-xs uppercase">
            <tr>
              <th className="w-[15%] py-2 text-left" scope="col"><EditableTranslation defaultText="From" description="Contact request sender column." translationKey="admin.contacts.table.from" /></th>
              <th className="w-[8%] py-2 text-left" scope="col"><EditableTranslation defaultText="Phone" description="Contact request phone column." translationKey="admin.contacts.table.phone" /></th>
              <th className="w-[11%] py-2 text-left" scope="col"><EditableTranslation defaultText="Subject" description="Contact request subject column." translationKey="admin.contacts.table.subject" /></th>
              {kind === "report" ? <>
                <th className="w-[11%] py-2 text-left" scope="col"><EditableTranslation defaultText="Category" description="AI feedback category column." translationKey="admin.contacts.table.category" /></th>
                <th className="w-[12%] py-2 text-left" scope="col"><EditableTranslation defaultText="User details" description="User feedback details column." translationKey="admin.contacts.table.user_details" /></th>
                <th className="w-[12%] py-2 text-left" scope="col"><EditableTranslation defaultText="Related content" description="Related chat or forum content column." translationKey="admin.contacts.table.chat_response" /></th>
                <th className="w-[12%] py-2 text-left" scope="col"><EditableTranslation defaultText="Content excerpt" description="Reported content preview column." translationKey="admin.contacts.table.response_excerpt" /></th>
              </> : <th className="w-[38%] py-2 text-left" scope="col"><EditableTranslation defaultText="Message" description="Contact inquiry preview column." translationKey="admin.contacts.table.message" /></th>}
              <th className="w-[10%] py-2 text-left" scope="col"><EditableTranslation defaultText="Received" description="Contact request date column." translationKey="admin.contacts.table.received" /></th>
              <th className="w-[5%] py-2 text-left" scope="col"><EditableTranslation defaultText="Status" description="Contact request status column." translationKey="admin.contacts.table.status" /></th>
              <th className="w-[6%] py-2 text-left" scope="col"><EditableTranslation defaultText="Actions" description="Contact request actions column." translationKey="admin.contacts.table.actions" /></th>
            </tr>
          </thead>
          <tbody>
            {!messagesConfirmed ? (
              <tr><td className="py-8 text-center text-muted-foreground" colSpan={kind === "report" ? 10 : 7}>{kind === "report" ? <EditableTranslation defaultText="Unable to load reports." description="Report list error." translationKey="admin.reports.load_error" /> : <EditableTranslation defaultText="Unable to load contact requests." description="Contact request list error." translationKey="admin.contacts.load_error" />}</td></tr>
            ) : effectiveMessages.length === 0 ? (
              <tr><td className="py-8 text-center text-muted-foreground" colSpan={kind === "report" ? 10 : 7}>{kind === "report" ? <EditableTranslation defaultText="No reports yet." description="Empty report list." translationKey="admin.reports.empty" /> : <EditableTranslation defaultText="No contact requests yet." description="Empty contact request list." translationKey="admin.contacts.empty" />}</td></tr>
            ) : effectiveMessages.map((message) => {
              const summary = summarizeContactMessage(message.message);
              const details = summary.isAiFeedback || summary.isForumReport ? summary.details : message.message;
              return (
                <tr className={`border-t align-top ${!message.isViewed && !viewedIds.has(message.id) ? "bg-red-50/50 dark:bg-red-950/10" : ""}`} key={message.id}>
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-1.5 truncate font-medium" title={message.name}>{!message.isViewed && !viewedIds.has(message.id) ? <><span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-destructive" /><span className="sr-only"><EditableTranslation defaultText="Unread" description="Unread contact or report label." translationKey="admin.contacts.unread" /></span></> : null}{message.name}</div>
                    <a className="block truncate text-muted-foreground text-xs hover:underline" href={`mailto:${message.email}`} title={message.email}>{message.email}</a>
                  </td>
                  <td className="py-3 pr-3 text-xs">{message.phone ? <a className="break-all hover:underline" href={`tel:${message.phone}`}>{message.phone}</a> : "—"}</td>
                  <td className="py-3 pr-3"><span className="line-clamp-2 font-medium" title={message.subject}>{message.subject}</span></td>
                  {kind === "report" ? <>
                  <td className="py-3 pr-3 text-xs"><span className="line-clamp-2" title={summary.category ?? undefined}>{summary.category ?? "—"}</span></td>
                  <td className="py-3 pr-3 text-xs"><span className="line-clamp-2 whitespace-pre-line break-words" title={details ?? undefined}>{details ?? "—"}</span></td>
                  <td className="py-3 pr-3 text-xs">
                    {summary.chatId ? (
                      <>
                        <a className="block cursor-pointer font-medium text-primary hover:underline" href={`/chat/${summary.chatId}`} rel="noopener noreferrer" target="_blank" title={summary.chatId}>
                          <EditableTranslation defaultText="Open chat" description="Open the chat related to a contact report." translationKey="admin.contacts.open_chat" />
                        </a>
                        <span className="block truncate text-muted-foreground" title={summary.chatId}><EditableTranslation defaultText="Chat ID" description="Related chat identifier detail label." translationKey="admin.contacts.dialog.chat_id" />: <span className="font-mono">{summary.chatId.slice(0, 8)}</span></span>
                        {summary.messageId ? <span className="block truncate text-muted-foreground" title={summary.messageId}><EditableTranslation defaultText="Message ID" description="Related response identifier detail label." translationKey="admin.contacts.dialog.message_id" />: <span className="font-mono">{summary.messageId.slice(0, 8)}</span></span> : null}
                      </>
                    ) : summary.forumUrl ? (
                      <a className="block cursor-pointer font-medium text-primary hover:underline" href={summary.forumUrl} rel="noopener noreferrer" target="_blank">
                        <EditableTranslation defaultText="Open discussion" description="Open the reported forum discussion." translationKey="admin.reports.open_forum" />
                      </a>
                    ) : "—"}
                  </td>
                  <td className="py-3 pr-3 text-xs"><span className="line-clamp-2 whitespace-pre-line break-words" title={summary.excerpt ?? undefined}>{summary.excerpt ?? "—"}</span></td>
                  </> : <td className="py-3 pr-3 text-xs"><span className="line-clamp-2 whitespace-pre-line break-words" title={message.message}>{message.message}</span></td>}
                  <td className="py-3 pr-3 text-xs"><time dateTime={message.createdAt} title={message.receivedAt}>{message.receivedRelative}</time><span className="block text-muted-foreground">{message.receivedAt}</span></td>
                  <td className="py-3 pr-3"><Status value={message.status} /></td>
                  <td className="py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger aria-label={kind === "report" ? translate("admin.reports.actions.label", "Report actions") : translate("admin.contacts.actions.label", "Contact actions")} className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-muted" title={kind === "report" ? translate("admin.reports.actions.label", "Report actions") : translate("admin.contacts.actions.label", "Contact actions")}><MoreVertical className="size-4" /></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openDetails(message)}><EditableTranslation defaultText="View details" description="Open full report in a dialog." translationKey="admin.contacts.view_details" /></DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => openStatus(message)}><EditableTranslation defaultText="Change status" description="Open status action dialog." translationKey="admin.reports.actions.change_status" /></DropdownMenuItem>
                        {kind === "contact" ? <DropdownMenuItem onSelect={() => openReply(message)}><EditableTranslation defaultText="Reply by email" description="Compose an email reply to a contact request." translationKey="admin.contacts.actions.reply" /></DropdownMenuItem> : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog onOpenChange={(open) => { if (!open) setSelectedId(null); }} open={selected !== undefined}>
        <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto">
          {selected && selectedSummary ? (
            <>
              <DialogHeader>
                <DialogTitle>{kind === "report" ? <EditableTranslation defaultText="Report details" description="Title of chat report details dialog." translationKey="admin.reports.dialog.title" /> : <EditableTranslation defaultText="Contact request details" description="Title of contact request details dialog." translationKey="admin.contacts.dialog.title" />}</DialogTitle>
                <DialogDescription>{kind === "report" ? <EditableTranslation defaultText="Full feedback and related response information." description="Description of chat report details dialog." translationKey="admin.reports.dialog.description" /> : <EditableTranslation defaultText="Full contact message and sender information." description="Description of contact request details dialog." translationKey="admin.contacts.dialog.description" />}</DialogDescription>
              </DialogHeader>
              {markingId === selected.id ? <output className="flex items-center gap-2 text-muted-foreground text-xs"><Loader2 aria-hidden="true" className="size-3 animate-spin" /><EditableTranslation defaultText="Marking as read..." description="Pending admin contact or report read update." translationKey="admin.contacts.mark_viewed_pending" /></output> : null}
              {viewErrorId === selected.id ? <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm"><EditableTranslation defaultText="Could not mark this item as read." description="Admin contact or report read update error." translationKey="admin.contacts.mark_viewed_error" /> <button className="ml-2 inline-flex cursor-pointer items-center gap-1 underline disabled:opacity-50" disabled={markingId === selected.id} onClick={() => void markViewed(selected)} type="button">{markingId === selected.id ? <Loader2 aria-hidden="true" className="size-3 animate-spin" /> : null}<EditableTranslation defaultText="Retry" description="Retry marking admin contact or report as read." translationKey="admin.contacts.mark_viewed_retry" /></button></div> : null}
              <dl className="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2">
                <Field label="From" translationKey="admin.contacts.table.from">{selected.name}</Field>
                <Field label="Email" translationKey="admin.contacts.dialog.email"><a className="hover:underline" href={`mailto:${selected.email}`}>{selected.email}</a></Field>
                <Field label="Phone" translationKey="admin.contacts.table.phone">{selected.phone ?? "—"}</Field>
                <Field label="Subject" translationKey="admin.contacts.table.subject">{selected.subject}</Field>
                {kind === "report" ? <Field label="Category" translationKey="admin.contacts.table.category">{selectedSummary.category ?? "—"}</Field> : null}
                <Field label="Status" translationKey="admin.contacts.table.status"><Status value={selected.status} /></Field>
                <Field label="Received" translationKey="admin.contacts.table.received">{selected.receivedAt}</Field>
                <Field label="Last updated" translationKey="admin.contacts.dialog.updated">{selected.updatedAtLabel}</Field>
                {selectedSummary.chatId ? <Field label="Chat ID" translationKey="admin.contacts.dialog.chat_id"><a className="cursor-pointer break-all text-primary hover:underline" href={`/chat/${selectedSummary.chatId}`} rel="noopener noreferrer" target="_blank">{selectedSummary.chatId}</a></Field> : null}
                {selectedSummary.forumUrl ? <Field label="Discussion" translationKey="admin.reports.discussion"><a className="cursor-pointer break-all text-primary hover:underline" href={selectedSummary.forumUrl} rel="noopener noreferrer" target="_blank"><EditableTranslation defaultText="Open discussion" description="Open the reported forum discussion." translationKey="admin.reports.open_forum" /></a></Field> : null}
                {selectedSummary.messageId ? <Field label="Message ID" translationKey="admin.contacts.dialog.message_id"><span className="break-all font-mono text-xs">{selectedSummary.messageId}</span></Field> : null}
                <Field label="Request ID" translationKey="admin.contacts.dialog.request_id"><span className="break-all font-mono text-xs">{selected.id}</span></Field>
              </dl>
              {selectedSummary.details ? <section><h3 className="mb-2 font-medium text-sm"><EditableTranslation defaultText="User details" description="User supplied details in a contact report." translationKey="admin.contacts.table.user_details" /></h3><p className="whitespace-pre-wrap break-words rounded-lg border p-3 text-sm">{selectedSummary.details}</p></section> : null}
              {selectedSummary.excerpt ? <section><h3 className="mb-2 font-medium text-sm"><EditableTranslation defaultText="Content excerpt" description="Reported content excerpt." translationKey="admin.contacts.table.response_excerpt" /></h3><p className="whitespace-pre-wrap break-words rounded-lg border p-3 text-sm">{selectedSummary.excerpt}</p></section> : null}
              <section><h3 className="mb-2 font-medium text-sm"><EditableTranslation defaultText="Full message" description="Original contact request message." translationKey="admin.contacts.dialog.full_message" /></h3><p className="whitespace-pre-wrap break-words rounded-lg border p-3 text-sm">{selected.message}</p></section>
              <section>
                <h3 className="mb-2 font-medium text-sm"><EditableTranslation defaultText="Action history" description="Report action history heading." translationKey="admin.reports.history.title" /></h3>
                {historyBusy ? <Loader2 aria-label={translate("admin.reports.history.loading", "Loading action history")} className="size-4 animate-spin" /> : historyError ? <div className="text-destructive text-sm"><EditableTranslation defaultText="Could not load action history." description="Report action history error." translationKey="admin.reports.history.error" /> <button className="cursor-pointer underline" onClick={() => void loadHistory(selected.id)} type="button"><EditableTranslation defaultText="Retry" description="Retry report action history." translationKey="admin.reports.filter.retry" /></button></div> : history.length ? <ol className="space-y-2">{history.map((event) => <li className="rounded-md border p-3 text-sm" key={event.id}><div><Status value={event.fromStatus} /> <span aria-hidden="true">→</span> <Status value={event.toStatus} /> <span className="ml-2 text-muted-foreground text-xs">{[event.actorFirstName, event.actorLastName].filter(Boolean).join(" ") || translate("admin.reports.history.unknown_actor", "Admin")}</span> <time className="ml-2 text-muted-foreground text-xs" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></div>{event.note ? <p className="mt-2 whitespace-pre-wrap break-words">{event.note}</p> : null}</li>)}</ol> : <p className="text-muted-foreground text-sm"><EditableTranslation defaultText="No actions recorded yet." description="Empty report action history." translationKey="admin.reports.history.empty" /></p>}
              </section>
              {kind === "contact" ? <section>
                <h3 className="mb-2 font-medium text-sm"><EditableTranslation defaultText="Email replies" description="Replies sent to a contact request." translationKey="admin.contacts.replies.title" /></h3>
                {repliesBusy ? <Loader2 aria-label={translate("admin.contacts.replies.loading", "Loading replies")} className="size-4 animate-spin" /> : repliesError ? <div className="text-destructive text-sm"><EditableTranslation defaultText="Could not load replies." description="Contact reply history error." translationKey="admin.contacts.replies.error" /> <button className="cursor-pointer underline" onClick={() => void loadReplies(selected.id)} type="button"><EditableTranslation defaultText="Retry" description="Retry loading replies." translationKey="admin.reports.filter.retry" /></button></div> : replies.length ? <ol className="space-y-2">{replies.map((reply) => <li className="rounded-md border p-3 text-sm" key={reply.id}><div className="flex flex-wrap items-center gap-2"><strong>{reply.recipientEmail}</strong><span className="text-muted-foreground text-xs">{new Date(reply.createdAt).toLocaleString()}</span><span className="rounded-full border px-2 py-0.5 text-xs">{reply.deliveryStatus === "sent" ? <EditableTranslation defaultText="Sent" description="Contact reply delivered status." translationKey="admin.contacts.replies.sent" /> : reply.deliveryStatus === "pending" ? <EditableTranslation defaultText="Pending" description="Contact reply pending status." translationKey="admin.contacts.replies.pending" /> : <EditableTranslation defaultText="Delivery unconfirmed" description="Contact reply uncertain status." translationKey="admin.contacts.replies.unconfirmed" />}</span></div><p className="mt-2 whitespace-pre-wrap break-words">{reply.body}</p></li>)}</ol> : <p className="text-muted-foreground text-sm"><EditableTranslation defaultText="No email replies yet." description="No replies sent to a contact request." translationKey="admin.contacts.replies.empty" /></p>}
              </section> : null}
              <DialogFooter><DialogClose className="cursor-pointer"><EditableTranslation defaultText="Close" description="Close contact request details dialog." translationKey="admin.contacts.dialog.close" /></DialogClose></DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog onOpenChange={(open) => { if (!open && !statusPending) setStatusMessageId(null); }} open={statusMessageId !== null}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{kind === "report" ? <EditableTranslation defaultText="Update report status" description="Report status action dialog title." translationKey="admin.reports.status_dialog.title" /> : <EditableTranslation defaultText="Update contact status" description="Contact request status dialog title." translationKey="admin.contacts.status_dialog.title" />}</DialogTitle>
            <DialogDescription><EditableTranslation defaultText="Choose the action taken and add an optional internal note." description="Report status action dialog description." translationKey="admin.reports.status_dialog.description" /></DialogDescription>
          </DialogHeader>
          <label className="flex flex-col gap-2 text-sm"><EditableTranslation defaultText="Status" description="Report action status field." translationKey="admin.contacts.table.status" />
            <select className="h-10 cursor-pointer rounded-md border bg-background px-3" disabled={statusPending} onChange={(event) => setTargetStatus(event.target.value as ContactMessage["status"])} value={targetStatus}>
              <option value="new">{translate("admin.contacts.status.new", "New")}</option><option value="in_progress">{translate("admin.reports.status.in_review", "In review")}</option><option value="resolved">{translate("admin.contacts.status.resolved", "Resolved")}</option><option value="archived">{translate("admin.reports.status.dismissed", "Dismissed")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm"><EditableTranslation defaultText="Action note (optional)" description="Optional report action note field." translationKey="admin.reports.status_dialog.note" />
            <textarea className="min-h-28 resize-y rounded-md border bg-background p-3" disabled={statusPending} maxLength={2000} onChange={(event) => setStatusNote(event.target.value)} placeholder={translate("admin.reports.status_dialog.note_placeholder", "Describe what was reviewed or done")} value={statusNote} />
          </label>
          {statusError ? <p className="text-destructive text-sm">{kind === "report" ? <EditableTranslation defaultText="Could not save this report action. Please retry." description="Report action save error." translationKey="admin.reports.status_dialog.error" /> : <EditableTranslation defaultText="Could not save this contact action. Please retry." description="Contact status action error." translationKey="admin.contacts.status_dialog.error" />}</p> : null}
          <DialogFooter>
            <button className="cursor-pointer rounded-md border px-4 py-2 text-sm" disabled={statusPending} onClick={() => setStatusMessageId(null)} type="button"><EditableTranslation defaultText="Cancel" description="Cancel report status action." translationKey="admin.reports.status_dialog.cancel" /></button>
            <button className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm disabled:cursor-not-allowed disabled:opacity-50" disabled={statusPending || effectiveMessages.find((item) => item.id === statusMessageId)?.status === targetStatus} onClick={() => void submitStatus()} type="button">{statusPending ? <Loader2 className="size-4 animate-spin" /> : null}<EditableTranslation defaultText="Submit action" description="Save report status action." translationKey="admin.reports.status_dialog.submit" /></button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {kind === "contact" ? <Dialog onOpenChange={(open) => { if (!open && !replyPending) setReplyMessageId(null); }} open={replyMessageId !== null}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle><EditableTranslation defaultText="Reply by email" description="Contact request email reply dialog title." translationKey="admin.contacts.reply.title" /></DialogTitle>
            <DialogDescription><EditableTranslation defaultText="Your reply will be emailed to the contact. Replies go to our support mailbox." description="Contact reply delivery explanation." translationKey="admin.contacts.reply.description" /></DialogDescription>
          </DialogHeader>
          {replyMessage ? <div className="space-y-1 rounded-md border bg-muted/20 p-3 text-sm"><p><strong><EditableTranslation defaultText="To" description="Email reply recipient label." translationKey="admin.contacts.reply.to" />:</strong> {replyMessage.email}</p><p><strong><EditableTranslation defaultText="Subject" description="Email reply subject label." translationKey="admin.contacts.table.subject" />:</strong> {/^re\s*:/i.test(replyMessage.subject) ? replyMessage.subject : `Re: ${replyMessage.subject}`}</p></div> : null}
          <label className="flex flex-col gap-2 text-sm"><EditableTranslation defaultText="Your reply" description="Contact reply message field." translationKey="admin.contacts.reply.body" />
            <textarea className="min-h-40 resize-y rounded-md border bg-background p-3" disabled={replyPending || replySent || replyError === "unconfirmed"} maxLength={10000} onChange={(event) => setReplyBody(event.target.value)} placeholder={translate("admin.contacts.reply.placeholder", "Write your response to the customer")} value={replyBody} />
          </label>
          {replySent ? <p className="text-green-700 text-sm"><EditableTranslation defaultText="Reply sent to the contact." description="Contact reply success message." translationKey="admin.contacts.reply.sent" /></p> : null}
          {replyError === "invalid" ? <p className="text-destructive text-sm"><EditableTranslation defaultText="This contact has no valid reply address." description="Contact reply invalid recipient error." translationKey="admin.contacts.reply.invalid" /></p> : null}
          {replyError === "unconfirmed" ? <p className="text-destructive text-sm"><EditableTranslation defaultText="Delivery could not be confirmed. Check the reply history or email logs before sending another reply." description="Contact reply uncertain delivery warning." translationKey="admin.contacts.reply.unconfirmed" /></p> : null}
          <DialogFooter>
            <button className="cursor-pointer rounded-md border px-4 py-2 text-sm disabled:opacity-50" disabled={replyPending} onClick={() => setReplyMessageId(null)} type="button"><EditableTranslation defaultText="Close" description="Close contact reply dialog." translationKey="admin.contacts.dialog.close" /></button>
            <button className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm disabled:cursor-not-allowed disabled:opacity-50" disabled={replyPending || replySent || !replyBody.trim() || replyError === "invalid"} onClick={() => void submitReply()} type="button">{replyPending ? <Loader2 className="size-4 animate-spin" /> : null}{replyError === "unconfirmed" ? <EditableTranslation defaultText="Check delivery" description="Check contact reply delivery without resending." translationKey="admin.contacts.reply.check" /> : <EditableTranslation defaultText="Send reply" description="Send the contact reply email." translationKey="admin.contacts.reply.send" />}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog> : null}
    </>
  );
}
