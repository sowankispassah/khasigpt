"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ContactMessagesTable, type ContactTableMessage } from "@/components/admin/contact-messages-table";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";

const pageSize = 25;
type ReportSource = "all" | "chat" | "forum" | "other";
type ReportStatus = "all" | "new" | "in_progress" | "resolved" | "archived";
type SpecificStatus = Exclude<ReportStatus, "all">;
type StatusCounts = Record<SpecificStatus, number>;

const statusSections = [
  { value: "new", text: "New", key: "admin.contacts.status.new" },
  { value: "in_progress", text: "In review", key: "admin.reports.status.in_review" },
  { value: "resolved", text: "Resolved", key: "admin.contacts.status.resolved" },
  { value: "archived", text: "Dismissed", key: "admin.reports.status.dismissed" },
] as const;

function ReportRows({
  status,
  source,
  search,
  revision,
  onStatusChanged,
  initialRows = [],
  initialTotal = 0,
  initialConfirmed = false,
  initialPage = 1,
}: {
  status: ReportStatus;
  source: ReportSource;
  search: string;
  revision: number;
  onStatusChanged: () => void;
  initialRows?: ContactTableMessage[];
  initialTotal?: number;
  initialConfirmed?: boolean;
  initialPage?: number;
}) {
  const { translate } = useTranslation();
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [hasResponse, setHasResponse] = useState(initialConfirmed);
  const [page, setPage] = useState(initialPage);
  const [busy, setBusy] = useState(!initialConfirmed);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const initialLoadHandled = useRef(false);

  useEffect(() => {
    if (!initialLoadHandled.current) {
      initialLoadHandled.current = true;
      if (initialConfirmed) return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setBusy(true);
      setError(false);
      const params = new URLSearchParams({ source, status, search, page: String(page), refresh: String(revision + retry) });
      try {
        const response = await fetch(`/api/admin/reports?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load reports");
        const data = await response.json() as { rows: ContactTableMessage[]; total: number };
        if (controller.signal.aborted) return;
        setRows(data.rows);
        setTotal(data.total);
        setHasResponse(true);
        const lastPage = Math.max(1, Math.ceil(data.total / pageSize));
        if (page > lastPage) setPage(lastPage);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, search ? 250 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [source, status, search, page, revision, retry, initialConfirmed]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(page * pageSize, total);
  return <div className="mt-3">
    {busy ? <output className="mb-3 flex items-center gap-2 text-muted-foreground text-sm"><Loader2 aria-hidden="true" className="size-4 animate-spin" /><EditableTranslation defaultText="Loading reports" description="Admin report table loading label." translationKey="admin.reports.filter.loading" /></output> : null}
    {error ? <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm"><EditableTranslation defaultText="Could not load filtered reports." description="Admin filtered reports load error." translationKey="admin.reports.filter.error" /> <button className="cursor-pointer underline" onClick={() => setRetry((value) => value + 1)} type="button"><EditableTranslation defaultText="Retry" description="Retry loading filtered reports." translationKey="admin.reports.filter.retry" /></button></div> : null}
    {hasResponse ? <>
      <ContactMessagesTable kind="report" messages={rows} messagesConfirmed onStatusChanged={onStatusChanged} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{translate("admin.reports.filter.showing", "Showing")} {rangeStart}-{rangeEnd} {translate("admin.reports.filter.of", "of")} {total.toLocaleString()} {translate("admin.reports.pagination_item", "reports")}</span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">{translate("admin.reports.filter.page", "Page")} {page} {translate("admin.reports.filter.of", "of")} {totalPages}</span>
          <button className="cursor-pointer rounded-md border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50" disabled={page <= 1 || busy} onClick={() => setPage(page - 1)} type="button">{translate("admin.reports.filter.previous", "Previous")}</button>
          <button className="cursor-pointer rounded-md border px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50" disabled={page >= totalPages || busy} onClick={() => setPage(page + 1)} type="button">{translate("admin.reports.filter.next", "Next")}</button>
        </div>
      </div>
    </> : null}
  </div>;
}

function StatusSection({
  status,
  label,
  translationKey,
  count,
  source,
  search,
  revision,
  onStatusChanged,
}: {
  status: SpecificStatus;
  label: string;
  translationKey: string;
  count: number | null;
  source: ReportSource;
  search: string;
  revision: number;
  onStatusChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  return <section className="rounded-lg border bg-card p-4">
    <h2>
      <button aria-controls={`report-section-${status}`} aria-expanded={open} className="flex w-full cursor-pointer items-center justify-between gap-3 text-left" onClick={() => setOpen((value) => !value)} type="button">
        <span className="flex items-center gap-2 font-semibold"><EditableTranslation defaultText={label} description={`Report section for ${label.toLowerCase()} status.`} translationKey={translationKey} /><span className="rounded-full border bg-muted px-2 py-0.5 text-xs font-normal tabular-nums">{count ?? "—"}</span></span>
        <ChevronDown aria-hidden="true" className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    </h2>
    {open ? <div id={`report-section-${status}`}><ReportRows key={`${status}:${source}:${search}`} status={status} source={source} search={search} revision={revision} onStatusChanged={onStatusChanged} /></div> : null}
  </section>;
}

export function ReportsWorkspace({ initialRows, initialTotal, initialConfirmed, initialPage }: {
  initialRows: ContactTableMessage[];
  initialTotal: number;
  initialConfirmed: boolean;
  initialPage: number;
}) {
  const { translate } = useTranslation();
  const [source, setSource] = useState<ReportSource>("all");
  const [search, setSearch] = useState("");
  const [hasInteracted, setHasInteracted] = useState(false);
  const [revision, setRevision] = useState(0);
  const [counts, setCounts] = useState<StatusCounts | null>(null);
  const [countsBusy, setCountsBusy] = useState(true);
  const [countsError, setCountsError] = useState(false);
  const [countsRetry, setCountsRetry] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCountsBusy(true);
      setCountsError(false);
      const params = new URLSearchParams({ summary: "1", source, search, refresh: String(revision + countsRetry) });
      try {
        const response = await fetch(`/api/admin/reports?${params}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load report counts");
        const data = await response.json() as { counts: StatusCounts };
        if (!controller.signal.aborted) setCounts(data.counts);
      } catch {
        if (!controller.signal.aborted) setCountsError(true);
      } finally {
        if (!controller.signal.aborted) setCountsBusy(false);
      }
    }, search ? 250 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [source, search, revision, countsRetry]);

  return <>
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium">
        <EditableTranslation defaultText="Search reports" description="Admin report live search label." translationKey="admin.reports.filter.search" />
        <input className="h-9 rounded-md border bg-background px-3 text-sm" maxLength={120} onChange={(event) => { setSearch(event.target.value); setHasInteracted(true); setCounts(null); }} placeholder={translate("admin.reports.filter.search_placeholder", "Search sender, subject, or content")} type="search" value={search} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium">
        <EditableTranslation defaultText="Report type" description="Admin report source filter label." translationKey="admin.reports.filter.type" />
        <select className="h-9 cursor-pointer rounded-md border bg-background px-3 text-sm" onChange={(event) => { setSource(event.target.value as ReportSource); setHasInteracted(true); setCounts(null); }} value={source}>
          <option value="all">{translate("admin.reports.filter.all_types", "All types")}</option><option value="chat">{translate("admin.reports.filter.chat", "Chat")}</option><option value="forum">{translate("admin.reports.filter.forum", "Forum")}</option><option value="other">{translate("admin.reports.filter.other", "Other")}</option>
        </select>
      </label>
    </div>
    <section className="rounded-lg border bg-card p-4">
      <h2 className="font-semibold"><EditableTranslation defaultText="All reports" description="Heading for the complete admin report table." translationKey="admin.reports.sections.all" /></h2>
      <ReportRows key={`all:${source}:${search}:${hasInteracted}`} status="all" source={source} search={search} revision={revision} onStatusChanged={refresh} initialRows={hasInteracted ? [] : initialRows} initialTotal={hasInteracted ? 0 : initialTotal} initialConfirmed={!hasInteracted && initialConfirmed} initialPage={hasInteracted ? 1 : initialPage} />
    </section>
    <div className="mt-4 space-y-3">
      {countsBusy ? <output className="flex items-center gap-2 text-muted-foreground text-xs"><Loader2 aria-hidden="true" className="size-3 animate-spin" /><EditableTranslation defaultText="Loading status counts" description="Loading report status section counts." translationKey="admin.reports.sections.counts_loading" /></output> : null}
      {countsError ? <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm"><EditableTranslation defaultText="Could not load status counts." description="Report status count error." translationKey="admin.reports.sections.counts_error" /> <button className="cursor-pointer underline" onClick={() => setCountsRetry((value) => value + 1)} type="button"><EditableTranslation defaultText="Retry" description="Retry loading report status counts." translationKey="admin.reports.filter.retry" /></button></div> : null}
      {statusSections.map((section) => <StatusSection key={section.value} status={section.value} label={section.text} translationKey={section.key} count={counts?.[section.value] ?? null} source={source} search={search} revision={revision} onStatusChanged={refresh} />)}
    </div>
  </>;
}
