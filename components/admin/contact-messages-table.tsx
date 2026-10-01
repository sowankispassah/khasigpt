"use client";

import { ChevronDown, Loader2, Mail, Maximize2, Minimize2, MoreVertical, Paperclip, SendHorizontal, StickyNote, X } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { ContactAccountPanel } from "@/components/admin/contact-account-panel";
import type { UserUpdatePayload } from "@/components/admin-user-actions-menu";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
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
import { type ContactAccountSummary, isContactAccountSummary } from "@/lib/contact/account-summary";
import type { ContactAttachment, ContactMessage } from "@/lib/db/schema";
import { fetchWithResponseTimeout } from "@/lib/utils/async";

export type ContactTableMessage = Omit<ContactMessage, "createdAt" | "updatedAt" | "lastInboundAt"> & {
  createdAt: string;
  receivedAt: string;
  receivedRelative: string;
  updatedAt: string;
  updatedAtLabel: string;
  lastInboundAt: string | null;
  latestInboundPreview?: string | null;
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
  email: string;
  direction: "inbound" | "outbound" | "note";
  subject: string;
  body: string;
  attachments: ContactAttachment[];
  deliveryStatus: "pending" | "sent" | "unconfirmed" | null;
  createdAt: string;
  sentAt: string | null;
  actorFirstName: string | null;
  actorLastName: string | null;
};

type ReplyKind = "public_reply" | "internal_note";

function AttachmentLinks({ files, source, id }: { files: ContactAttachment[]; source: "contact" | "reply"; id: string }) {
  if (!Array.isArray(files) || !files.length) return null;
  return <div className="mt-2 flex flex-wrap gap-2">{files.map((file) => <a className="inline-flex max-w-full cursor-pointer items-center gap-1 rounded-md border border-current/20 px-2 py-1 text-xs underline-offset-2 hover:underline" href={`/api/admin/contact-messages/attachments?source=${source}&id=${encodeURIComponent(id)}&attachmentId=${encodeURIComponent(file.id)}`} key={file.id} rel="noreferrer" target="_blank"><Paperclip aria-hidden="true" className="size-3 shrink-0" /><span className="max-w-56 truncate" title={file.name}>{file.name}</span></a>)}</div>;
}

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

function ContactConversationView({
  message,
  inboundConfigured,
  account,
  accountBusy,
  accountLoaded,
  accountError,
  currentAdminId,
  isFullscreen,
  replies,
  repliesBusy,
  repliesError,
  history,
  historyBusy,
  historyError,
  marking,
  viewError,
  replyBody,
  replyKind,
  replyFiles,
  replyAttachmentError,
  replyPending,
  replySent,
  replyError,
  conversationEnd,
  onReplyChange,
  onReplyKindChange,
  onReplyFilesChange,
  onRemoveReplyFile,
  onSendReply,
  onRetryReplies,
  onRetryHistory,
  onRetryAccount,
  onAccountUpdated,
  onAccountRefresh,
  onRetryViewed,
  onToggleFullscreen,
}: {
  message: ContactTableMessage;
  inboundConfigured?: boolean;
  account: ContactAccountSummary | null;
  accountBusy: boolean;
  accountLoaded: boolean;
  accountError: boolean;
  currentAdminId: string | null;
  isFullscreen: boolean;
  replies: ContactReply[];
  repliesBusy: boolean;
  repliesError: boolean;
  history: StatusEvent[];
  historyBusy: boolean;
  historyError: boolean;
  marking: boolean;
  viewError: boolean;
  replyBody: string;
  replyKind: ReplyKind;
  replyFiles: File[];
  replyAttachmentError: string | null;
  replyPending: boolean;
  replySent: boolean;
  replyError: "invalid" | "unconfirmed" | null;
  conversationEnd: RefObject<HTMLDivElement | null>;
  onReplyChange: (value: string) => void;
  onReplyKindChange: (value: ReplyKind) => void;
  onReplyFilesChange: (files: File[]) => void;
  onRemoveReplyFile: (index: number) => void;
  onSendReply: () => void;
  onRetryReplies: () => void;
  onRetryHistory: () => void;
  onRetryAccount: () => void;
  onAccountUpdated: (patch: UserUpdatePayload) => void;
  onAccountRefresh: () => void;
  onRetryViewed: () => void;
  onToggleFullscreen: () => void;
}) {
  const { translate } = useTranslation();
  const fullscreenLabel = isFullscreen
    ? translate("admin.contacts.dialog.restore", "Restore window")
    : translate("admin.contacts.dialog.fullscreen", "Full screen");
  return (
    <>
      <DialogHeader className="shrink-0 border-b px-5 py-4 pr-24 text-left sm:pl-6 sm:pr-24">
        <Button aria-label={fullscreenLabel} aria-pressed={isFullscreen} className="absolute top-4 right-14 size-8" onClick={onToggleFullscreen} size="icon" title={fullscreenLabel} type="button" variant="outline">
          {isFullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
        </Button>
        <DialogClose aria-label={translate("admin.contacts.dialog.close", "Close")} className="absolute top-4 right-4 size-8 cursor-pointer p-0" disabled={replyPending} title={translate("admin.contacts.dialog.close", "Close")}><X aria-hidden="true" className="size-4" /></DialogClose>
        <div className="flex flex-wrap items-center gap-2">
          <DialogTitle className="min-w-0 break-words text-xl">{message.subject}</DialogTitle>
          <Status value={message.status} />
        </div>
        <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <EditableTranslation defaultText="Conversation with" description="Contact conversation participant label." translationKey="admin.contacts.conversation.with" />
          <span className="font-medium text-foreground">{message.name}</span>
          <span aria-hidden="true">·</span>
          <span className="break-all">{message.email}</span>
        </DialogDescription>
      </DialogHeader>

      <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[220px_minmax(0,1fr)_260px] md:overflow-hidden">
        <div className="order-1 flex min-h-[420px] min-w-0 flex-col md:order-2 md:min-h-0 md:border-r">
          <section aria-label={translate("admin.contacts.conversation.title", "Conversation")} className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-muted/20 px-4 py-5 sm:px-6">
            <div className="flex flex-col items-start gap-1">
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                <span className="font-medium text-foreground">{message.name}</span>
                <time dateTime={message.createdAt}>{message.receivedAt}</time>
              </div>
              <div className="max-w-[90%] whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm border bg-background px-4 py-3 text-sm shadow-sm">{message.message}<AttachmentLinks files={message.attachments} id={message.id} source="contact" /></div>
            </div>
            {replies.map((reply) => {
              const note = reply.direction === "note";
              const outgoing = reply.direction !== "inbound";
              const adminName = [reply.actorFirstName, reply.actorLastName].filter(Boolean).join(" ");
              return (
                <div className={`flex flex-col gap-1 ${outgoing ? "items-end" : "items-start"}`} key={reply.id}>
                  <div className={`flex flex-wrap items-center gap-2 text-muted-foreground text-xs ${outgoing ? "justify-end" : ""}`}>
                    <span className="font-medium text-foreground">{outgoing ? adminName || translate("admin.reports.history.unknown_actor", "Admin") : message.name}</span>
                    <time dateTime={reply.createdAt}>{new Date(reply.createdAt).toLocaleString()}</time>
                    {note ? <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"><EditableTranslation defaultText="Internal note" description="Private contact conversation note label." translationKey="admin.contacts.notes.label" /></span> : null}
                    {reply.direction === "outbound" && reply.deliveryStatus !== "sent" ? <span className="rounded-full border px-1.5 py-0.5">{reply.deliveryStatus === "pending" ? <EditableTranslation defaultText="Pending" description="Contact reply pending status." translationKey="admin.contacts.replies.pending" /> : <EditableTranslation defaultText="Delivery unconfirmed" description="Contact reply uncertain status." translationKey="admin.contacts.replies.unconfirmed" />}</span> : null}
                  </div>
                  <div className={`max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm shadow-sm ${note ? "rounded-tr-sm border border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100" : outgoing ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm border bg-background"}`}>{reply.body}<AttachmentLinks files={reply.attachments} id={reply.id} source="reply" /></div>
                </div>
              );
            })}
            {repliesBusy ? <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 aria-hidden="true" className="size-4 animate-spin" /><EditableTranslation defaultText="Loading replies" description="Contact conversation loading status." translationKey="admin.contacts.replies.loading" /></div> : null}
            {repliesError ? <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm"><EditableTranslation defaultText="Could not load replies." description="Contact reply history error." translationKey="admin.contacts.replies.error" /> <button className="cursor-pointer underline" onClick={onRetryReplies} type="button"><EditableTranslation defaultText="Retry" description="Retry loading contact replies." translationKey="admin.reports.filter.retry" /></button></div> : null}
            <div ref={conversationEnd} />
          </section>

          <div className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
            <DropdownMenu>
              <DropdownMenuTrigger aria-label={translate("admin.contacts.composer.mode", "Message type")} className="mb-2 inline-flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 font-medium text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50" disabled={replyPending || replyError === "unconfirmed"} id="contact-conversation-reply-label" type="button">
                {replyKind === "public_reply" ? <EditableTranslation defaultText="Public reply" description="Contact composer public reply mode." translationKey="admin.contacts.composer.public" /> : <EditableTranslation defaultText="Internal note" description="Contact composer private note mode." translationKey="admin.contacts.notes.label" />}
                <ChevronDown aria-hidden="true" className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem className="cursor-pointer" onSelect={() => onReplyKindChange("public_reply")}><Mail aria-hidden="true" className="mr-2 size-4" /><EditableTranslation defaultText="Public reply" description="Select public email reply mode." translationKey="admin.contacts.composer.public" /></DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer" onSelect={() => onReplyKindChange("internal_note")}><StickyNote aria-hidden="true" className="mr-2 size-4" /><EditableTranslation defaultText="Internal note" description="Select private note mode." translationKey="admin.contacts.notes.label" /></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <textarea aria-labelledby="contact-conversation-reply-label" className={`min-h-20 max-h-40 w-full resize-y rounded-lg border p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${replyKind === "internal_note" ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20" : "bg-background"}`} disabled={replyPending || (replyKind === "public_reply" && (replyError === "invalid" || replyError === "unconfirmed"))} id="contact-conversation-reply" maxLength={10000} onChange={(event) => onReplyChange(event.target.value)} placeholder={replyKind === "public_reply" ? translate("admin.contacts.reply.placeholder", "Write your response to the customer") : translate("admin.contacts.notes.placeholder", "Write a note for your team")} value={replyBody} />
            <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
              <Paperclip aria-hidden="true" className="size-4" />
              <EditableTranslation defaultText="Add attachments" description="Add files to an admin contact reply." translationKey="admin.contacts.attachments.add" />
              <input accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.docx" className="sr-only" disabled={replyPending || (replyKind === "public_reply" && (replyError === "invalid" || replyError === "unconfirmed"))} key={message.id} multiple onChange={(event) => onReplyFilesChange(Array.from(event.target.files ?? []))} type="file" />
            </label>
            <p className="mt-1 text-muted-foreground text-xs"><EditableTranslation defaultText="Up to 3 files, 3 MB total. PDF, images, text, or DOCX." description="Contact reply attachment limits." translationKey="contact.form.attachments.help" /></p>
            {replyFiles.length ? <ul className="mt-2 flex flex-wrap gap-2">{replyFiles.map((file, index) => <li className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs" key={`${index}-${file.name}`}><span className="max-w-48 truncate" title={file.name}>{file.name}</span><button aria-label={translate("admin.contacts.attachments.remove", "Remove attachment")} className="cursor-pointer" disabled={replyPending} onClick={() => onRemoveReplyFile(index)} type="button"><X aria-hidden="true" className="size-3" /></button></li>)}</ul> : null}
            {replyAttachmentError ? <p className="mt-1 text-destructive text-xs" role="alert">{replyAttachmentError}</p> : null}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-muted-foreground text-xs">{replyKind === "internal_note" ? <><StickyNote aria-hidden="true" className="size-3.5" /><EditableTranslation defaultText="Visible only to admins. Not emailed to the customer." description="Private contact note delivery explanation." translationKey="admin.contacts.notes.private" /></> : <><Mail aria-hidden="true" className="size-3.5" />{inboundConfigured ? <EditableTranslation defaultText="Sent by email; replies appear here." description="Contact conversation email delivery note." translationKey="admin.contacts.conversation.email_note" /> : <EditableTranslation defaultText="Sent by email." description="Contact conversation email delivery note when inbound mail is unavailable." translationKey="admin.contacts.conversation.email_only" />}</>}</p>
              <button className="inline-flex min-w-28 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm disabled:cursor-not-allowed disabled:opacity-50" disabled={replyPending || (!replyBody.trim() && !replyFiles.length) || (replyKind === "public_reply" && replyError === "invalid")} onClick={onSendReply} type="button">{replyPending ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : replyKind === "internal_note" ? <StickyNote aria-hidden="true" className="size-4" /> : <SendHorizontal aria-hidden="true" className="size-4" />}{replyKind === "internal_note" ? <EditableTranslation defaultText="Add note" description="Save a private contact conversation note." translationKey="admin.contacts.notes.add" /> : replyError === "unconfirmed" ? <EditableTranslation defaultText="Check delivery" description="Check contact reply delivery without resending." translationKey="admin.contacts.reply.check" /> : <EditableTranslation defaultText="Send reply" description="Send the contact reply email." translationKey="admin.contacts.reply.send" />}</button>
            </div>
            {replySent ? <output className="mt-2 block text-green-700 text-sm">{replyKind === "internal_note" ? <EditableTranslation defaultText="Internal note saved." description="Private contact note success message." translationKey="admin.contacts.notes.saved" /> : <EditableTranslation defaultText="Reply sent to the contact." description="Contact reply success message." translationKey="admin.contacts.reply.sent" />}</output> : null}
            {replyError === "invalid" ? <p className="mt-2 text-destructive text-sm" role="alert"><EditableTranslation defaultText="This contact has no valid reply address." description="Contact reply invalid recipient error." translationKey="admin.contacts.reply.invalid" /></p> : null}
            {replyError === "unconfirmed" ? <p className="mt-2 text-destructive text-sm" role="alert"><EditableTranslation defaultText="Delivery could not be confirmed. Check the reply history or email logs before sending another reply." description="Contact reply uncertain delivery warning." translationKey="admin.contacts.reply.unconfirmed" /></p> : null}
          </div>
        </div>

        <aside className="order-2 max-h-52 space-y-5 overflow-y-auto border-t bg-background px-4 py-4 text-sm md:order-1 md:max-h-none md:min-h-0 md:border-r md:border-t-0">
          <section>
            <h3 className="mb-3 font-semibold"><EditableTranslation defaultText="Customer details" description="Contact conversation customer information heading." translationKey="admin.contacts.conversation.customer_details" /></h3>
            <dl className="space-y-3">
              <Field label="Name" translationKey="admin.contacts.account.name">{message.name}</Field>
              <Field label="Email" translationKey="admin.contacts.dialog.email"><a className="break-all text-primary hover:underline" href={`mailto:${message.email}`}>{message.email}</a></Field>
              <Field label="Phone" translationKey="admin.contacts.table.phone">{message.phone || "—"}</Field>
              <Field label="Received" translationKey="admin.contacts.table.received">{message.receivedAt}</Field>
              <Field label="Last updated" translationKey="admin.contacts.dialog.updated">{message.updatedAtLabel}</Field>
              <Field label="Request ID" translationKey="admin.contacts.dialog.request_id"><span className="break-all font-mono text-xs">{message.id}</span></Field>
            </dl>
          </section>
          {marking ? <output className="flex items-center gap-2 text-muted-foreground text-xs"><Loader2 aria-hidden="true" className="size-3 animate-spin" /><EditableTranslation defaultText="Marking as read..." description="Pending admin contact read update." translationKey="admin.contacts.mark_viewed_pending" /></output> : null}
          {viewError ? <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-destructive text-xs"><EditableTranslation defaultText="Could not mark this item as read." description="Admin contact read update error." translationKey="admin.contacts.mark_viewed_error" /> <button className="cursor-pointer underline" disabled={marking} onClick={onRetryViewed} type="button"><EditableTranslation defaultText="Retry" description="Retry marking admin contact as read." translationKey="admin.contacts.mark_viewed_retry" /></button></div> : null}
          <section className="border-t pt-4">
            <h3 className="mb-2 font-semibold"><EditableTranslation defaultText="Action history" description="Contact action history heading." translationKey="admin.reports.history.title" /></h3>
            {historyBusy ? <Loader2 aria-label={translate("admin.reports.history.loading", "Loading action history")} className="size-4 animate-spin" /> : historyError ? <div className="text-destructive text-xs"><EditableTranslation defaultText="Could not load action history." description="Contact action history error." translationKey="admin.reports.history.error" /> <button className="cursor-pointer underline" onClick={onRetryHistory} type="button"><EditableTranslation defaultText="Retry" description="Retry contact action history." translationKey="admin.reports.filter.retry" /></button></div> : history.length ? <ol className="space-y-3">{history.map((event) => <li className="border-l-2 pl-2 text-xs" key={event.id}><div className="flex flex-wrap items-center gap-1"><Status value={event.toStatus} /><time className="text-muted-foreground" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></div>{event.note ? <p className="mt-1 whitespace-pre-wrap break-words">{event.note}</p> : null}</li>)}</ol> : <p className="text-muted-foreground text-xs"><EditableTranslation defaultText="No actions recorded yet." description="Empty contact action history." translationKey="admin.reports.history.empty" /></p>}
          </section>
        </aside>
        <aside className="order-3 space-y-4 border-t bg-background px-4 py-4 text-sm md:min-h-0 md:overflow-y-auto md:border-t-0">
          <h3 className="font-semibold"><EditableTranslation defaultText="Account details" description="Matching account information in the contact conversation." translationKey="admin.contacts.account.title" /></h3>
          {accountBusy ? <p className="flex items-center gap-2 text-muted-foreground text-xs"><Loader2 aria-hidden="true" className="size-3 animate-spin" /><EditableTranslation defaultText="Checking for an account..." description="Contact account lookup loading message." translationKey="admin.contacts.account.loading" /></p> : null}
          {accountError ? <div className="text-destructive text-xs"><EditableTranslation defaultText="Account details could not be loaded." description="Contact account lookup failure message." translationKey="admin.contacts.account.error" /> <button className="cursor-pointer underline disabled:cursor-not-allowed disabled:opacity-50" disabled={accountBusy} onClick={onRetryAccount} type="button"><EditableTranslation defaultText="Retry" description="Retry contact account lookup." translationKey="admin.reports.filter.retry" /></button></div> : null}
          {account ? <ContactAccountPanel account={account} currentAdminId={currentAdminId} onRefresh={onAccountRefresh} onUpdated={onAccountUpdated} refreshing={accountBusy || accountError} /> : accountLoaded && !accountBusy && !accountError ? <p className="text-muted-foreground text-xs"><EditableTranslation defaultText="No KhasiGPT account matches this contact email." description="Contact email does not match any account." translationKey="admin.contacts.account.no_match" /></p> : null}
        </aside>
      </div>
    </>
  );
}

export function ContactMessagesTable({
  kind,
  inboundConfigured,
  messages,
  messagesConfirmed,
  onStatusChanged,
}: {
  kind: ContactMessage["kind"];
  inboundConfigured?: boolean;
  messages: ContactTableMessage[];
  messagesConfirmed: boolean;
  onStatusChanged?: () => void;
}) {
  const { translate } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedContactId = useRef<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
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
  const [replyRequestId, setReplyRequestId] = useState<string | null>(null);
  const [replyKind, setReplyKind] = useState<ReplyKind>("public_reply");
  const [replyBody, setReplyBody] = useState("");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [replyAttachmentError, setReplyAttachmentError] = useState<string | null>(null);
  const [replyPending, setReplyPending] = useState(false);
  const [replySent, setReplySent] = useState(false);
  const [replyError, setReplyError] = useState<"invalid" | "unconfirmed" | null>(null);
  const [replies, setReplies] = useState<ContactReply[]>([]);
  const [repliesBusy, setRepliesBusy] = useState(false);
  const [repliesError, setRepliesError] = useState(false);
  const repliesRequest = useRef(0);
  const [account, setAccount] = useState<ContactAccountSummary | null>(null);
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountLoaded, setAccountLoaded] = useState(false);
  const [accountError, setAccountError] = useState(false);
  const accountRequest = useRef(0);
  const conversationEnd = useRef<HTMLDivElement>(null);
  const effectiveMessages = messages.map((message) => statusOverrides[message.id]
    ? { ...message, status: statusOverrides[message.id] }
    : message);
  const selected = effectiveMessages.find((message) => message.id === selectedId);
  const selectedSummary = selected ? summarizeContactMessage(selected.message) : null;
  const chronologicalReplies = [...replies].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  useEffect(() => {
    if (kind === "contact" && selectedId && !repliesBusy && !repliesError) {
      conversationEnd.current?.scrollIntoView({ block: "end" });
    }
  }, [kind, selectedId, repliesBusy, repliesError]);

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
    selectedContactId.current = message.id;
    setSelectedId(message.id);
    setIsFullscreen(false);
    if (kind === "contact") {
      setReplyKind("public_reply");
      setReplyRequestId(crypto.randomUUID());
      setReplyBody("");
      setReplyFiles([]);
      setReplyAttachmentError(null);
      setReplySent(false);
      setReplyError(null);
    }
    void markViewed(message);
    void loadHistory(message.id);
    if (kind === "contact") {
      void loadReplies(message.id);
      void loadAccount(message.id);
    }
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

  async function loadReplies(id: string, preserveExisting = false) {
    const requestId = ++repliesRequest.current;
    setRepliesBusy(true);
    setRepliesError(false);
    if (!preserveExisting) setReplies([]);
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

  async function loadAccount(id: string, preserveExisting = false) {
    if (selectedContactId.current !== id) return;
    const requestId = ++accountRequest.current;
    setAccountBusy(true);
    if (!preserveExisting) setAccountLoaded(false);
    setAccountError(false);
    if (!preserveExisting) { setAccount(null); setCurrentAdminId(null); }
    try {
      const data = await fetchWithResponseTimeout(`/api/admin/contact-messages/account?id=${encodeURIComponent(id)}`, { cache: "no-store", credentials: "same-origin" }, 10_000, async (response) => {
        if (!response.ok) throw new Error("Unable to load account");
        return await response.json() as { account: unknown; currentAdminId?: unknown };
      });
      if (data.account !== null && !isContactAccountSummary(data.account)) throw new Error("Invalid account details");
      if (requestId === accountRequest.current && selectedContactId.current === id) {
        setAccount(data.account);
        setCurrentAdminId(typeof data.currentAdminId === "string" ? data.currentAdminId : null);
        setAccountLoaded(true);
      }
    } catch {
      if (requestId === accountRequest.current && selectedContactId.current === id) setAccountError(true);
    } finally {
      if (requestId === accountRequest.current && selectedContactId.current === id) setAccountBusy(false);
    }
  }

  function openStatus(message: ContactTableMessage, next?: ContactMessage["status"]) {
    setStatusMessageId(message.id);
    setTargetStatus(next ?? (message.status === "new" ? "in_progress" : message.status));
    setStatusNote("");
    setStatusError(false);
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
    if (!selectedId || !replyRequestId || replyPending || (!replyBody.trim() && !replyFiles.length)) return;
    if (replyFiles.length > 3 || replyFiles.reduce((size, file) => size + file.size, 0) > 3 * 1024 * 1024) {
      setReplyAttachmentError(translate("contact.form.attachments.error.too_large", "Select up to 3 files, 3 MB total."));
      return;
    }
    setReplyPending(true);
    setReplyError(null);
    setReplyAttachmentError(null);
    try {
      const formData = new FormData();
      formData.set("id", selectedId);
      formData.set("requestId", replyRequestId);
      formData.set("body", replyBody.trim());
      formData.set("kind", replyKind);
      for (const file of replyFiles) formData.append("attachments", file);
      const response = await fetch("/api/admin/contact-messages/replies", {
        method: "POST",
        body: formData,
        cache: "no-store",
      });
      if (response.status === 413 || response.status === 503) {
        setReplyAttachmentError(translate(response.status === 413 ? "contact.form.attachments.error.too_large" : "contact.form.attachments.error.upload_failed", response.status === 413 ? "Attachments must be 3 MB or smaller in total." : "Could not upload the attachment. Please try again."));
        return;
      }
      if (response.status === 422 || response.status === 400) {
        const issue = await response.json().catch(() => ({})) as { attachmentError?: string };
        if (issue.attachmentError) setReplyAttachmentError(translate(`contact.form.attachments.error.${issue.attachmentError}`, "Please check your attachments."));
        else setReplyError("invalid");
        return;
      }
      if (!response.ok) throw new Error("Reply delivery unavailable");
      const result = await response.json() as { deliveryStatus: ContactReply["deliveryStatus"] | "saved" };
      if (result.deliveryStatus === (replyKind === "internal_note" ? "saved" : "sent")) {
        setReplySent(true);
        setReplyBody("");
        setReplyFiles([]);
        setReplyRequestId(crypto.randomUUID());
        void loadReplies(selectedId, true);
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
      {kind === "contact" && !inboundConfigured ? <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-sm dark:bg-amber-950/20 dark:text-amber-200"><EditableTranslation defaultText="Incoming email is not connected yet. Customer responses currently go to the support mailbox." description="Admin contact inbound email connection warning." translationKey="admin.contacts.inbound.not_connected" /></p> : null}
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
                  </> : <td className="py-3 pr-3 text-xs">{message.lastInboundAt ? <span className="mb-1 block font-medium text-primary"><EditableTranslation defaultText="Customer replied" description="Contact table indicator for an incoming email reply." translationKey="admin.contacts.inbound.indicator" /></span> : null}<span className="line-clamp-2 whitespace-pre-line break-words" title={message.latestInboundPreview ?? message.message}>{message.latestInboundPreview ?? message.message}</span></td>}
                  <td className="py-3 pr-3 text-xs"><time dateTime={message.createdAt} title={message.receivedAt}>{message.receivedRelative}</time><span className="block text-muted-foreground">{message.receivedAt}</span>{kind === "contact" && message.lastInboundAt ? <span className="mt-1 block text-primary"><EditableTranslation defaultText="Latest reply" description="Contact table timestamp label for incoming email." translationKey="admin.contacts.inbound.latest" />: {new Date(message.lastInboundAt).toLocaleString()}</span> : null}</td>
                  <td className="py-3 pr-3"><Status value={message.status} /></td>
                  <td className="py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger aria-label={kind === "report" ? translate("admin.reports.actions.label", "Report actions") : translate("admin.contacts.actions.label", "Contact actions")} className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-muted" title={kind === "report" ? translate("admin.reports.actions.label", "Report actions") : translate("admin.contacts.actions.label", "Contact actions")}><MoreVertical className="size-4" /></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openDetails(message)}><EditableTranslation defaultText="View details" description="Open full report in a dialog." translationKey="admin.contacts.view_details" /></DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => openStatus(message)}><EditableTranslation defaultText="Change status" description="Open status action dialog." translationKey="admin.reports.actions.change_status" /></DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog onOpenChange={(open) => { if (!open && !replyPending) { selectedContactId.current = null; setSelectedId(null); setIsFullscreen(false); } }} open={selected !== undefined}>
        <DialogContent className={kind === "contact" ? `flex flex-col gap-0 overflow-hidden p-0 ${isFullscreen ? "left-0 top-0 h-dvh w-dvw max-w-none translate-x-0 translate-y-0 rounded-none border-0 shadow-none sm:rounded-none" : "h-[min(90dvh,900px)] w-[calc(100vw-2rem)] max-w-6xl"}` : "max-h-[90dvh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto"}>
          {selected && selectedSummary ? (
            kind === "contact" ? <ContactConversationView
              account={account}
              accountBusy={accountBusy}
              accountError={accountError}
              accountLoaded={accountLoaded}
              currentAdminId={currentAdminId}
              isFullscreen={isFullscreen}
              conversationEnd={conversationEnd}
              inboundConfigured={inboundConfigured}
              history={history}
              historyBusy={historyBusy}
              historyError={historyError}
              marking={markingId === selected.id}
              message={selected}
              onReplyChange={(value) => { setReplyBody(value); setReplySent(false); }}
              onReplyKindChange={(value) => { setReplyKind(value); setReplyRequestId(crypto.randomUUID()); setReplyError(null); setReplyAttachmentError(null); setReplySent(false); }}
              onReplyFilesChange={(files) => { setReplyFiles(files); setReplyAttachmentError(null); setReplySent(false); }}
              onRemoveReplyFile={(index) => setReplyFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
              onRetryHistory={() => void loadHistory(selected.id)}
              onRetryAccount={() => void loadAccount(selected.id, Boolean(account))}
              onAccountRefresh={() => void loadAccount(selected.id, true)}
              onAccountUpdated={(patch) => { if (selectedContactId.current !== selected.id) return; setAccount((current) => current ? { ...current, ...patch } : null); void loadAccount(selected.id, true); }}
              onRetryReplies={() => void loadReplies(selected.id, true)}
              onRetryViewed={() => void markViewed(selected)}
              onToggleFullscreen={() => setIsFullscreen((current) => !current)}
              onSendReply={() => void submitReply()}
              replies={chronologicalReplies}
              repliesBusy={repliesBusy}
              repliesError={repliesError}
              replyBody={replyBody}
              replyKind={replyKind}
              replyFiles={replyFiles}
              replyAttachmentError={replyAttachmentError}
              replyError={replyError}
              replyPending={replyPending}
              replySent={replySent}
              viewError={viewErrorId === selected.id}
            /> : <>
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
    </>
  );
}
