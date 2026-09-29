"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ContactMessagesTable, type ContactTableMessage } from "@/components/admin/contact-messages-table";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";

const pageSize = 25;
type ReportSource = "all" | "chat" | "forum" | "other";
type ReportStatus = "all" | "new" | "in_progress" | "resolved" | "archived";

export function ReportsWorkspace({ initialRows, initialTotal, initialConfirmed, initialPage }: {
  initialRows: ContactTableMessage[];
  initialTotal: number;
  initialConfirmed: boolean;
  initialPage: number;
}) {
  const { translate } = useTranslation();
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [confirmed, setConfirmed] = useState(initialConfirmed);
  const [source, setSource] = useState<ReportSource>("all");
  const [status, setStatus] = useState<ReportStatus>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(initialPage);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);

  const refresh = useCallback(() => setRetry((value) => value + 1), []);
  useEffect(() => {
    if (source === "all" && status === "all" && !search && page === initialPage && retry === 0 && initialConfirmed) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setBusy(true);
      const params = new URLSearchParams({ source, status, search, page: String(page) });
      try {
        const response = await fetch(`/api/admin/reports?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load reports");
        const data = await response.json() as { rows: ContactTableMessage[]; total: number };
        if (controller.signal.aborted) return;
        setRows(data.rows);
        setTotal(data.total);
        setConfirmed(true);
        if (page > Math.max(1, Math.ceil(data.total / pageSize))) setPage(Math.max(1, Math.ceil(data.total / pageSize)));
      } catch {
        if (!controller.signal.aborted) setConfirmed(false);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, search ? 250 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [source, status, search, page, retry, initialPage, initialConfirmed]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(page * pageSize, total);
  return <>
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium">
        <EditableTranslation defaultText="Search reports" description="Admin report live search label." translationKey="admin.reports.filter.search" />
        <input className="h-9 rounded-md border bg-background px-3 text-sm" maxLength={120} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={translate("admin.reports.filter.search_placeholder", "Search sender, subject, or content")} type="search" value={search} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        <EditableTranslation defaultText="Report type" description="Admin report source filter label." translationKey="admin.reports.filter.type" />
        <select className="h-9 cursor-pointer rounded-md border bg-background px-3 text-sm" onChange={(event) => { setSource(event.target.value as ReportSource); setPage(1); }} value={source}>
          <option value="all">{translate("admin.reports.filter.all_types", "All types")}</option><option value="chat">{translate("admin.reports.filter.chat", "Chat")}</option><option value="forum">{translate("admin.reports.filter.forum", "Forum")}</option><option value="other">{translate("admin.reports.filter.other", "Other")}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        <EditableTranslation defaultText="Status" description="Admin report status filter label." translationKey="admin.reports.filter.status" />
        <select className="h-9 cursor-pointer rounded-md border bg-background px-3 text-sm" onChange={(event) => { setStatus(event.target.value as ReportStatus); setPage(1); }} value={status}>
          <option value="all">{translate("admin.reports.filter.all_statuses", "All statuses")}</option><option value="new">{translate("admin.contacts.status.new", "New")}</option><option value="in_progress">{translate("admin.reports.status.in_review", "In review")}</option><option value="resolved">{translate("admin.contacts.status.resolved", "Resolved")}</option><option value="archived">{translate("admin.reports.status.dismissed", "Dismissed")}</option>
        </select>
      </label>
      {busy ? <Loader2 aria-label={translate("admin.reports.filter.loading", "Loading reports")} className="mb-2 size-4 animate-spin text-muted-foreground" /> : null}
    </div>
    {!confirmed ? <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm"><EditableTranslation defaultText="Could not load filtered reports." description="Admin filtered reports load error." translationKey="admin.reports.filter.error" /> <button className="cursor-pointer underline" onClick={refresh} type="button"><EditableTranslation defaultText="Retry" description="Retry loading filtered reports." translationKey="admin.reports.filter.retry" /></button></div> : null}
    <ContactMessagesTable kind="report" messages={rows} messagesConfirmed={confirmed} onStatusChanged={refresh} />
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{translate("admin.reports.filter.showing", "Showing")} {rangeStart}-{rangeEnd} {translate("admin.reports.filter.of", "of")} {total.toLocaleString()} {translate("admin.reports.pagination_item", "reports")}</span>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">{translate("admin.reports.filter.page", "Page")} {page} {translate("admin.reports.filter.of", "of")} {totalPages}</span>
        <button className="cursor-pointer rounded-md border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50" disabled={page <= 1 || busy} onClick={() => setPage(page - 1)} type="button">{translate("admin.reports.filter.previous", "Previous")}</button>
        <button className="cursor-pointer rounded-md border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50" disabled={page >= totalPages || busy} onClick={() => setPage(page + 1)} type="button">{translate("admin.reports.filter.next", "Next")}</button>
      </div>
    </div>
  </>;
}
