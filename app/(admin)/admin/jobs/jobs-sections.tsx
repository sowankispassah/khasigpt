import {
  Bot,
  Briefcase,
  CalendarClock,
  ChevronDown,
  ExternalLink,
  FileText,
  History,
} from "lucide-react";
import type { ReactNode } from "react";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { AdminPagination } from "@/components/admin/admin-pagination";
import {
  AdminEmptyState,
  AdminNotice,
  AdminPanel,
  AdminStatCard,
  AdminStatusPill,
  type AdminStatusTone,
} from "@/components/admin/admin-ui";
import { AdminJobEditDialog } from "@/components/admin-job-edit-dialog";
import { AdminJobsExpandableTable } from "@/components/admin-jobs-expandable-table";
import { JobsAutoScrapeStatus } from "@/components/jobs-auto-scrape-status";
import { EditableTranslation } from "@/components/translation-edit-provider";
import type { JobsPdfExtractionSettings } from "@/lib/jobs/pdf-extraction-settings";
import type {
  JobsScrapeRunnerMode,
  JobsScrapeScheduleSettings,
  JobsScrapeScheduleState,
} from "@/lib/jobs/schedule";
import type { JobsScrapeHistoryEntry } from "@/lib/jobs/scrape-orchestrator";
import type {
  ManagedJobSource,
  ManagedJobSourceLocationScope,
} from "@/lib/jobs/source-registry";
import type { JobPostingRecord } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";

/**
 * Presentational sections for /admin/jobs. The page loads data and owns the
 * server actions; these components only render, so a preview can feed them
 * sample data.
 */

export type JobsFormAction = (formData: FormData) => void | Promise<void>;

export const JOBS_INPUT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-background px-3 font-normal text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
const SELECT_CLASS = cn(JOBS_INPUT_CLASS, "cursor-pointer px-2.5");
const LABEL_CLASS = "flex flex-col gap-1.5 font-medium text-sm";
const ROW_BUTTON_CLASS = "h-8 cursor-pointer px-3 text-xs";

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatMaybeDateTime(value: Date | null, timezone: string) {
  if (!value) {
    return "Not available";
  }
  return value.toLocaleString("en-IN", {
    timeZone: timezone,
  });
}

function formatShortDateTime(value: Date | null, timezone: string) {
  if (!value) {
    return null;
  }
  return value.toLocaleString("en-IN", {
    day: "numeric",
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
    month: "short",
    timeZone: timezone,
  });
}

function formatIsoDateTime(value: string, timezone: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Not available";
  }
  return parsed.toLocaleString("en-IN", {
    timeZone: timezone,
  });
}

function formatDurationMs(value: number) {
  if (!(Number.isFinite(value) && value >= 0)) {
    return "0s";
  }
  const totalSeconds = Math.floor(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

function formatDescription(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "No description captured for this listing.";
  }
  return normalized.length > 260 ? `${normalized.slice(0, 260)}...` : normalized;
}

function formatPdfExtractionModeLabel(mode: JobsPdfExtractionSettings["mode"]) {
  if (mode === "off") {
    return "Off";
  }
  if (mode === "full") {
    return "Full";
  }
  return "Hybrid";
}

function formatLocationScope(value: ManagedJobSourceLocationScope) {
  return value === "all_locations" ? "All locations" : "Meghalaya-only";
}

function isPdfUrl(url: string | null) {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    return pathname.endsWith(".pdf") || pathname.includes(".pdf");
  } catch {
    return false;
  }
}

function extractPdfUrlFromContent(content: string) {
  const match = content.match(/PDF Source:\s*(https?:\/\/\S+)/i);
  if (!match?.[1]) {
    return null;
  }

  const candidate = match[1].replace(/[),.;]+$/g, "");
  try {
    return new URL(candidate).toString();
  } catch {
    return null;
  }
}

function resolvePdfUrl(job: Pick<JobPostingRecord, "content" | "pdfCachedUrl" | "pdfSourceUrl" | "sourceUrl">) {
  if (isPdfUrl(job.pdfCachedUrl)) {
    return job.pdfCachedUrl;
  }
  if (isPdfUrl(job.pdfSourceUrl)) {
    return job.pdfSourceUrl;
  }
  if (isPdfUrl(job.sourceUrl)) {
    return job.sourceUrl;
  }
  return extractPdfUrlFromContent(job.content);
}

const PDF_CACHE_STATES = {
  cached: { label: "Cached", title: "PDF copy stored in our cache", tone: "success" },
  derived: { label: "Derived", title: "PDF link found in the listing text", tone: "warning" },
  external: { label: "External", title: "Linked PDF that is not cached yet", tone: "info" },
  none: { label: "None", title: "No PDF for this listing", tone: "neutral" },
} as const satisfies Record<string, { label: string; title: string; tone: AdminStatusTone }>;

function getJobPdfCacheState(
  job: Pick<JobPostingRecord, "content" | "pdfCachedUrl" | "pdfSourceUrl" | "sourceUrl">
): keyof typeof PDF_CACHE_STATES {
  if (job.pdfCachedUrl) {
    return "cached";
  }
  if (job.pdfSourceUrl) {
    return "external";
  }
  if (isPdfUrl(job.sourceUrl) || extractPdfUrlFromContent(job.content)) {
    return "derived";
  }
  return "none";
}

const HISTORY_STATUS_TONES: Record<JobsScrapeHistoryEntry["status"], AdminStatusTone> = {
  cancelled: "warning",
  failed: "danger",
  skipped: "neutral",
  success: "success",
};

const HISTORY_PROGRESS_COLORS: Record<JobsScrapeHistoryEntry["status"], string> = {
  cancelled: "bg-amber-500",
  failed: "bg-rose-500",
  skipped: "bg-muted-foreground/50",
  success: "bg-emerald-500",
};

function StatText({ children }: { children: ReactNode }) {
  return <span className="block text-lg leading-snug sm:text-xl">{children}</span>;
}

function JobStatusPill({ status }: { status: JobPostingRecord["status"] }) {
  return (
    <AdminStatusPill className="capitalize" tone={status === "active" ? "success" : "neutral"}>
      {status}
    </AdminStatusPill>
  );
}

function PdfCachePill({ state }: { state: keyof typeof PDF_CACHE_STATES }) {
  const meta = PDF_CACHE_STATES[state];
  return (
    <span title={meta.title}>
      <AdminStatusPill tone={meta.tone}>{meta.label}</AdminStatusPill>
    </span>
  );
}

function Th({
  align = "left",
  children,
  className,
}: {
  align?: "left" | "right";
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-4 py-2.5 font-medium",
        align === "right" ? "text-right" : "text-left",
        className
      )}
      scope="col"
    >
      {children}
    </th>
  );
}

function DetailList({ items }: { items: Array<{ label: ReactNode; value: ReactNode } | null> }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.filter(Boolean).map((item, index) =>
        item ? (
          <div className="min-w-0" key={`detail-${index + 1}`}>
            <dt className="text-muted-foreground text-xs">{item.label}</dt>
            <dd className="mt-0.5 break-words font-medium text-sm">{item.value}</dd>
          </div>
        ) : null
      )}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Layout pieces
// ---------------------------------------------------------------------------

/** Collapsible panel for rarely changed settings. */
export function JobsSectionCard({
  children,
  contentClassName,
  defaultOpen = false,
  description,
  meta,
  title,
}: {
  children: ReactNode;
  contentClassName?: string;
  defaultOpen?: boolean;
  description?: ReactNode;
  meta?: ReactNode;
  title: ReactNode;
}) {
  return (
    <details
      className="group overflow-hidden rounded-xl border bg-card shadow-xs"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-5 py-4 transition hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <h2 className="font-semibold text-base">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-muted-foreground text-sm">{description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          {meta}
          <ChevronDown
            aria-hidden="true"
            className="size-4 text-muted-foreground transition-transform duration-150 group-open:rotate-180"
          />
        </div>
      </summary>
      <div className={cn("border-t p-5 text-sm", contentClassName)}>{children}</div>
    </details>
  );
}

export function JobsPanelFallback({ rows, title }: { rows: number; title: ReactNode }) {
  return (
    <AdminPanel title={title}>
      <div aria-busy="true" className="space-y-3 p-5">
        {Array.from({ length: rows }, (_, index) => (
          <div className="h-10 animate-pulse rounded-lg bg-muted/50" key={`row-${index + 1}`} />
        ))}
      </div>
    </AdminPanel>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export function JobsOverview({
  lastSuccessAt,
  nextDueAt,
  runnerMode,
  scheduleSettings,
  settingsUnavailable,
  totalJobs,
  totalJobsUnavailable,
}: {
  lastSuccessAt: Date | null;
  nextDueAt: Date | null;
  runnerMode: JobsScrapeRunnerMode;
  scheduleSettings: JobsScrapeScheduleSettings;
  settingsUnavailable: boolean;
  totalJobs: number;
  totalJobsUnavailable: boolean;
}) {
  const timezone = scheduleSettings.timezone;
  return (
    <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <AdminStatCard
        hint={
          <EditableTranslation
            defaultText="Active and inactive listings"
            description="Hint under the admin jobs listing count card."
            translationKey="admin.jobs.overview.listings_hint"
          />
        }
        icon={Briefcase}
        label={
          <EditableTranslation
            defaultText="Job listings"
            description="Admin jobs overview card for the number of saved listings."
            translationKey="admin.jobs.overview.listings"
          />
        }
        value={totalJobsUnavailable ? null : totalJobs.toLocaleString("en-IN")}
      />
      <AdminStatCard
        hint={
          <EditableTranslation
            defaultText="Most recent completed import"
            description="Hint under the admin jobs last successful import card."
            translationKey="admin.jobs.overview.last_success_hint"
          />
        }
        icon={History}
        label={
          <EditableTranslation
            defaultText="Last successful import"
            description="Admin jobs overview card for the last successful import time."
            translationKey="admin.jobs.overview.last_success"
          />
        }
        value={
          settingsUnavailable ? null : (
            <StatText>
              {formatShortDateTime(lastSuccessAt, timezone) ?? (
                <span className="text-muted-foreground">
                  <EditableTranslation
                    defaultText="Never"
                    description="Shown when no jobs import has succeeded yet."
                    translationKey="admin.jobs.overview.never"
                  />
                </span>
              )}
            </StatText>
          )
        }
      />
      <AdminStatCard
        hint={
          runnerMode === "chatgpt" ? (
            <EditableTranslation
              defaultText="Runs from the ChatGPT app schedule"
              description="Hint on the admin jobs next run card in ChatGPT runner mode."
              translationKey="admin.jobs.overview.next_run_chatgpt"
            />
          ) : scheduleSettings.enabled ? (
            <EditableTranslation
              defaultText="Every {hours} h"
              description="Hint on the admin jobs next run card showing the schedule interval."
              translationKey="admin.jobs.overview.next_run_interval"
              values={{ hours: scheduleSettings.intervalHours }}
            />
          ) : (
            <EditableTranslation
              defaultText="Automatic scraping is off"
              description="Hint on the admin jobs next run card when scheduled scraping is disabled."
              translationKey="admin.jobs.overview.next_run_off"
            />
          )
        }
        icon={CalendarClock}
        label={
          <EditableTranslation
            defaultText="Next scheduled run"
            description="Admin jobs overview card for the next scheduled import."
            translationKey="admin.jobs.overview.next_run"
          />
        }
        value={
          settingsUnavailable ? null : (
            <StatText>
              {runnerMode === "chatgpt" || !scheduleSettings.enabled
                ? "—"
                : (formatShortDateTime(nextDueAt, timezone) ?? "—")}
            </StatText>
          )
        }
      />
      <AdminStatCard
        hint={
          <EditableTranslation
            defaultText="Starts automatic imports"
            description="Hint under the admin jobs runner card."
            translationKey="admin.jobs.overview.runner_hint"
          />
        }
        icon={Bot}
        label={
          <EditableTranslation
            defaultText="Runner"
            description="Admin jobs overview card showing which schedule runs imports."
            translationKey="admin.jobs.overview.runner"
          />
        }
        value={
          settingsUnavailable ? null : (
            <StatText>
              {runnerMode === "chatgpt" ? (
                <EditableTranslation
                  defaultText="ChatGPT app schedule"
                  description="Label for the ChatGPT desktop jobs import schedule."
                  translationKey="admin.jobs.runner.chatgpt"
                />
              ) : (
                <EditableTranslation
                  defaultText="Project schedule"
                  description="Label for the site's built-in jobs import schedule."
                  translationKey="admin.jobs.runner.project"
                />
              )}
            </StatText>
          )
        }
      />
    </section>
  );
}

export function JobsImportPanel({ children }: { children: ReactNode }) {
  return (
    <AdminPanel
      bodyClassName="p-5"
      description="Scrapes every enabled source and saves new listings. Each source can be Meghalaya-only or all locations; manage them under Source management."
      title="Automated jobs ingestion"
    >
      {children}
    </AdminPanel>
  );
}

// ---------------------------------------------------------------------------
// Job listings
// ---------------------------------------------------------------------------

function JobRowActions({
  deleteAction,
  job,
  statusAction,
}: {
  deleteAction: JobsFormAction;
  job: JobPostingRecord;
  statusAction: JobsFormAction;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:justify-end">
      <AdminJobEditDialog
        job={{
          id: job.id,
          title: job.title,
          company: job.company,
          location: job.location,
          status: job.status === "inactive" ? "inactive" : "active",
          description: job.content,
          sourceUrl: job.sourceUrl,
          pdfSourceUrl: job.pdfSourceUrl,
          pdfCachedUrl: job.pdfCachedUrl,
        }}
      />
      <form action={statusAction}>
        <input name="id" type="hidden" value={job.id} />
        <input
          name="nextStatus"
          type="hidden"
          value={job.status === "active" ? "inactive" : "active"}
        />
        <ActionSubmitButton
          className={ROW_BUTTON_CLASS}
          pendingLabel="Updating..."
          size="sm"
          successMessage="Job status updated."
          variant="outline"
        >
          {job.status === "active" ? "Set inactive" : "Set active"}
        </ActionSubmitButton>
      </form>
      <form action={deleteAction}>
        <input name="id" type="hidden" value={job.id} />
        <ActionSubmitButton
          className={ROW_BUTTON_CLASS}
          pendingLabel="Deleting..."
          size="sm"
          successMessage="Job deleted."
          variant="destructive"
        >
          Delete
        </ActionSubmitButton>
      </form>
    </div>
  );
}

function JobLinks({ job }: { job: JobPostingRecord }) {
  const pdfUrl = resolvePdfUrl(job) ? `/api/jobs/${job.id}/pdf` : null;
  if (!job.sourceUrl && !pdfUrl) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex items-center gap-3 text-xs">
      {job.sourceUrl ? (
        <a
          className="inline-flex cursor-pointer items-center gap-1 text-primary hover:underline"
          href={job.sourceUrl}
          rel="noreferrer"
          target="_blank"
        >
          <ExternalLink aria-hidden="true" className="size-3" />
          Source
        </a>
      ) : null}
      {pdfUrl ? (
        <a
          className="inline-flex cursor-pointer items-center gap-1 text-primary hover:underline"
          href={pdfUrl}
          rel="noreferrer"
          target="_blank"
        >
          <FileText aria-hidden="true" className="size-3" />
          PDF
        </a>
      ) : null}
    </div>
  );
}

export function JobsListPanel({
  deleteAction,
  jobs,
  jobsUnavailable,
  page,
  pageSize,
  searchParams,
  statusAction,
  timezone,
  totalJobs,
  totalJobsUnavailable,
}: {
  deleteAction: JobsFormAction;
  jobs: JobPostingRecord[];
  jobsUnavailable: boolean;
  page: number;
  pageSize: number;
  searchParams?: Record<string, string | string[] | undefined>;
  statusAction: JobsFormAction;
  timezone: string;
  totalJobs: number;
  totalJobsUnavailable: boolean;
}) {
  const renderRow = (job: JobPostingRecord) => {
    const pdfState = getJobPdfCacheState(job);
    const addedOn = job.createdAt.toLocaleString("en-IN", {
      timeZone: timezone,
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    const description = formatDescription(job.content);
    return (
      <tr className="align-top transition hover:bg-muted/30" key={job.id}>
        <td className="w-full max-w-0 px-4 py-3 md:w-auto md:max-w-[30rem]">
          <p className="truncate font-medium" title={job.title}>
            {job.title}
          </p>
          <p className="truncate text-muted-foreground text-xs" title={`${job.company} · ${job.location}`}>
            {job.company} · {job.location}
          </p>
          <p className="mt-1 hidden truncate text-muted-foreground text-xs lg:block" title={description}>
            {description}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs md:hidden">
            <JobStatusPill status={job.status} />
            <PdfCachePill state={pdfState} />
            <span className="text-muted-foreground">{addedOn}</span>
          </div>
          <div className="mt-2 lg:hidden">
            <JobLinks job={job} />
          </div>
          <div className="mt-3 md:hidden">
            <JobRowActions deleteAction={deleteAction} job={job} statusAction={statusAction} />
          </div>
        </td>
        <td className="hidden px-4 py-3 md:table-cell">
          <JobStatusPill status={job.status} />
        </td>
        <td className="hidden px-4 py-3 lg:table-cell">
          <PdfCachePill state={pdfState} />
        </td>
        <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground text-xs md:table-cell">
          {addedOn}
        </td>
        <td className="hidden px-4 py-3 lg:table-cell">
          <JobLinks job={job} />
        </td>
        <td className="hidden px-4 py-3 md:table-cell">
          <JobRowActions deleteAction={deleteAction} job={job} statusAction={statusAction} />
        </td>
      </tr>
    );
  };

  return (
    <AdminPanel
      action={
        <AdminStatusPill>
          {totalJobsUnavailable ? "Count unavailable" : `${totalJobs.toLocaleString("en-IN")} jobs`}
        </AdminStatusPill>
      }
      description="Scraped and manual listings, newest first. Edit, deactivate or delete a listing here."
      title="Jobs"
    >
      {jobsUnavailable ? (
        <div className="p-5">
          <AdminNotice>
            Jobs could not be loaded right now. Existing data was not replaced
            with an empty fallback; refresh this section to retry.
          </AdminNotice>
        </div>
      ) : jobs.length === 0 ? (
        <AdminEmptyState
          icon={Briefcase}
          title="No jobs are available in the Supabase jobs table yet."
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-muted-foreground text-xs">
                <tr>
                  <Th>Job</Th>
                  <Th className="hidden md:table-cell">Status</Th>
                  <Th className="hidden lg:table-cell">PDF cache</Th>
                  <Th className="hidden md:table-cell">Added on</Th>
                  <Th className="hidden lg:table-cell">Links</Th>
                  <Th align="right" className="hidden md:table-cell">
                    Actions
                  </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">{jobs.map(renderRow)}</tbody>
            </table>
          </div>
          <div className="border-t px-4 py-3">
            {totalJobsUnavailable ? (
              <AdminNotice>
                Total job count is temporarily unavailable, so pagination is
                hidden until the count query succeeds.
              </AdminNotice>
            ) : (
              <AdminPagination
                itemLabel="jobs"
                page={page}
                pageSize={pageSize}
                pathname="/admin/jobs"
                searchParams={searchParams}
                totalItems={totalJobs}
              />
            )}
          </div>
        </>
      )}
    </AdminPanel>
  );
}

// ---------------------------------------------------------------------------
// Import history
// ---------------------------------------------------------------------------

export function JobsHistoryPanel({
  entries,
  nextDueAt,
  runnerMode,
  scheduleSettings,
}: {
  /** null when the history read failed. */
  entries: JobsScrapeHistoryEntry[] | null;
  nextDueAt: Date | null;
  runnerMode: JobsScrapeRunnerMode;
  scheduleSettings: JobsScrapeScheduleSettings;
}) {
  const items = entries ?? [];
  const timezone = scheduleSettings.timezone;

  const renderRow = (entry: JobsScrapeHistoryEntry) => {
    const notes =
      entry.errorMessage ??
      entry.skipReason ??
      (entry.status === "success" ? "Completed successfully." : "No additional details.");
    const result = `${entry.inserted} new · ${entry.updated} updated · ${entry.skippedDuplicates} duplicates`;
    return (
      <tr className="align-top transition hover:bg-muted/30" key={entry.runId}>
        <td className="w-full max-w-0 px-4 py-3 md:w-auto md:max-w-none">
          <p className="whitespace-nowrap font-medium text-sm">
            {formatIsoDateTime(entry.startedAt, timezone)}
          </p>
          <p className="text-muted-foreground text-xs capitalize">{entry.trigger}</p>
          <p className="mt-1 text-muted-foreground text-xs md:hidden">
            {entry.processedSources}/{entry.totalSources} sources · {formatDurationMs(entry.durationMs)}
          </p>
          <p className="mt-0.5 text-muted-foreground text-xs sm:hidden">{result}</p>
          <p className="mt-1 whitespace-normal text-muted-foreground text-xs lg:hidden">{notes}</p>
        </td>
        <td className="px-4 py-3">
          <AdminStatusPill className="capitalize" tone={HISTORY_STATUS_TONES[entry.status]}>
            {entry.status}
          </AdminStatusPill>
          <div className="mt-2 w-28">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", HISTORY_PROGRESS_COLORS[entry.status])}
                style={{ width: `${entry.completionPercent}%` }}
              />
            </div>
            <p className="mt-1 text-muted-foreground text-xs tabular-nums">
              {entry.completionPercent}%
            </p>
          </div>
        </td>
        <td className="hidden whitespace-nowrap px-4 py-3 text-xs tabular-nums md:table-cell">
          {entry.processedSources}/{entry.totalSources}
        </td>
        <td className="hidden whitespace-nowrap px-4 py-3 text-xs tabular-nums md:table-cell">
          {formatDurationMs(entry.durationMs)}
        </td>
        <td className="hidden whitespace-nowrap px-4 py-3 text-xs tabular-nums sm:table-cell">
          <div>Inserted: {entry.inserted}</div>
          <div>Updated: {entry.updated}</div>
          <div className="text-muted-foreground">Duplicates: {entry.skippedDuplicates}</div>
        </td>
        <td className="hidden max-w-xs px-4 py-3 text-muted-foreground text-xs lg:table-cell">
          {notes}
        </td>
      </tr>
    );
  };

  return (
    <AdminPanel
      action={
        runnerMode === "project" ? (
          <span className="hidden text-muted-foreground text-xs sm:inline">
            Next scheduled run at:{" "}
            <span className="font-medium text-foreground">
              {scheduleSettings.enabled
                ? formatMaybeDateTime(nextDueAt, timezone)
                : "Scheduled scrape disabled"}
            </span>
          </span>
        ) : null
      }
      description={
        <EditableTranslation
          defaultText="Latest 50 job import runs from the project and ChatGPT schedules."
          description="Description above the admin jobs import history table."
          translationKey="admin.jobs.history.summary"
        />
      }
      title="Scraping history"
    >
      {entries === null ? (
        <div className="p-5">
          <AdminNotice>
            Scrape history is temporarily unavailable. Please refresh in a few seconds.
          </AdminNotice>
        </div>
      ) : items.length === 0 ? (
        <AdminEmptyState icon={History} title="No scrape history yet." />
      ) : (
        <AdminJobsExpandableTable
          header={
            <tr>
              <Th>Run time</Th>
              <Th>Status</Th>
              <Th className="hidden md:table-cell">Sources</Th>
              <Th className="hidden md:table-cell">Duration</Th>
              <Th className="hidden sm:table-cell">Result</Th>
              <Th className="hidden lg:table-cell">Notes</Th>
            </tr>
          }
          initialRows={items.slice(0, 10).map(renderRow)}
          remainingCount={Math.max(0, items.length - 10)}
          remainingRows={items.slice(10).map(renderRow)}
        />
      )}
    </AdminPanel>
  );
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

function SourceRowActions({
  deleteAction,
  scopeAction,
  source,
  toggleAction,
}: {
  deleteAction: JobsFormAction;
  scopeAction: JobsFormAction;
  source: ManagedJobSource;
  toggleAction: JobsFormAction;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:justify-end">
      <form action={toggleAction}>
        <input name="sourceId" type="hidden" value={source.id} />
        <input name="nextEnabled" type="hidden" value={source.enabled ? "false" : "true"} />
        <ActionSubmitButton
          className={ROW_BUTTON_CLASS}
          pendingLabel="Updating..."
          size="sm"
          successMessage="Source updated."
          variant="outline"
        >
          {source.enabled ? "Disable" : "Enable"}
        </ActionSubmitButton>
      </form>
      <form action={scopeAction}>
        <input name="sourceId" type="hidden" value={source.id} />
        <input
          name="nextLocationScope"
          type="hidden"
          value={source.locationScope === "meghalaya_only" ? "all_locations" : "meghalaya_only"}
        />
        <ActionSubmitButton
          className={ROW_BUTTON_CLASS}
          pendingLabel="Updating..."
          size="sm"
          successMessage="Source scope updated."
          variant="outline"
        >
          {source.locationScope === "meghalaya_only" ? "All locations" : "Meghalaya-only"}
        </ActionSubmitButton>
      </form>
      <form action={deleteAction}>
        <input name="sourceId" type="hidden" value={source.id} />
        <ActionSubmitButton
          className={ROW_BUTTON_CLASS}
          pendingLabel="Removing..."
          size="sm"
          successMessage="Source removed."
          variant="destructive"
        >
          Remove
        </ActionSubmitButton>
      </form>
    </div>
  );
}

export function JobsSourcesPanel({
  addAction,
  deleteAction,
  scopeAction,
  sources,
  timezone,
  toggleAction,
  unavailable,
}: {
  addAction: JobsFormAction;
  deleteAction: JobsFormAction;
  scopeAction: JobsFormAction;
  sources: ManagedJobSource[];
  timezone: string;
  toggleAction: JobsFormAction;
  unavailable: boolean;
}) {
  const enabledCount = sources.filter((source) => source.enabled).length;

  return (
    <AdminPanel
      action={
        unavailable ? null : (
          <AdminStatusPill tone={enabledCount > 0 ? "success" : "warning"}>
            {enabledCount}/{sources.length} enabled
          </AdminStatusPill>
        )
      }
      description={
        unavailable
          ? "Managed sources are temporarily unavailable."
          : enabledCount === 0
            ? "No enabled source is configured, so fallback sources from config/jobSources.ts will be used."
            : "Enabled sources are used for all manual and scheduled scrape runs."
      }
      title="Source management"
    >
      <div className="border-b p-5">
        <details className="group rounded-lg border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 font-medium text-sm transition hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
            Add a source
            <ChevronDown
              aria-hidden="true"
              className="size-4 text-muted-foreground transition-transform duration-150 group-open:rotate-180"
            />
          </summary>
          <form action={addAction} className="grid gap-4 border-t p-4 md:grid-cols-2">
            <p className="text-muted-foreground text-xs md:col-span-2">
              Use <strong>Auto</strong> for most sites. The scraper will try generic
              extraction patterns. You can choose per-source location scope below.
            </p>
            <label className={cn(LABEL_CLASS, "md:col-span-2")}>
              Source URL
              <input
                className={JOBS_INPUT_CLASS}
                name="url"
                placeholder="https://in.linkedin.com/jobs/search/?keywords=Shillong&location=Meghalaya"
                required
                type="url"
              />
            </label>
            <label className={LABEL_CLASS}>
              Display name (optional)
              <input className={JOBS_INPUT_CLASS} name="name" placeholder="LinkedIn Meghalaya Shillong" />
            </label>
            <label className={LABEL_CLASS}>
              Source type
              <select className={SELECT_CLASS} defaultValue="auto" name="type">
                <option value="auto">Auto (recommended)</option>
                <option value="generic">Generic website</option>
                <option value="linkedin">LinkedIn</option>
              </select>
            </label>
            <label className={LABEL_CLASS}>
              Location scope
              <select className={SELECT_CLASS} defaultValue="meghalaya_only" name="locationScope">
                <option value="meghalaya_only">Meghalaya-only</option>
                <option value="all_locations">All locations</option>
              </select>
            </label>
            <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm">
              <input className="cursor-pointer" defaultChecked name="enabled" type="checkbox" value="true" />
              Enable this source immediately
            </label>
            <div className="md:col-span-2">
              <ActionSubmitButton
                className="cursor-pointer"
                pendingLabel="Saving source..."
                refreshOnSuccess
                successMessage="Source saved."
              >
                Add Source
              </ActionSubmitButton>
            </div>
          </form>
        </details>
      </div>

      {unavailable ? (
        <div className="p-5">
          <AdminNotice>
            Source rows could not be confirmed. The table is hidden instead of
            showing an empty fallback.
          </AdminNotice>
        </div>
      ) : sources.length === 0 ? (
        <AdminEmptyState
          description="Add at least one source URL above."
          title="No managed sources added yet."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-muted-foreground text-xs">
              <tr>
                <Th>Source</Th>
                <Th className="hidden sm:table-cell">Type</Th>
                <Th className="hidden md:table-cell">Scope</Th>
                <Th className="hidden md:table-cell">Status</Th>
                <Th className="hidden lg:table-cell">Updated</Th>
                <Th align="right" className="hidden md:table-cell">
                  Actions
                </Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {sources.map((source) => (
                <tr className="align-top transition hover:bg-muted/30" key={source.id}>
                  <td className="w-full max-w-0 px-4 py-3 md:w-auto md:max-w-[26rem]">
                    <p className="truncate font-medium">{source.name}</p>
                    <a
                      className="block cursor-pointer truncate text-primary text-xs hover:underline"
                      href={source.url}
                      rel="noreferrer"
                      target="_blank"
                      title={source.url}
                    >
                      {source.url}
                    </a>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs md:hidden">
                      <AdminStatusPill tone={source.enabled ? "success" : "neutral"}>
                        {source.enabled ? "Enabled" : "Disabled"}
                      </AdminStatusPill>
                      <span className="text-muted-foreground">
                        <span className="capitalize">{source.type}</span> ·{" "}
                        {formatLocationScope(source.locationScope)}
                      </span>
                    </div>
                    <div className="mt-3 md:hidden">
                      <SourceRowActions
                        deleteAction={deleteAction}
                        scopeAction={scopeAction}
                        source={source}
                        toggleAction={toggleAction}
                      />
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-xs capitalize sm:table-cell">{source.type}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-xs md:table-cell">
                    {formatLocationScope(source.locationScope)}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <AdminStatusPill tone={source.enabled ? "success" : "neutral"}>
                      {source.enabled ? "Enabled" : "Disabled"}
                    </AdminStatusPill>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground text-xs lg:table-cell">
                    {formatIsoDateTime(source.updatedAt, timezone)}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <SourceRowActions
                      deleteAction={deleteAction}
                      scopeAction={scopeAction}
                      source={source}
                      toggleAction={toggleAction}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminPanel>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function JobsScheduleSettingsCard({
  clearOneTimeAction,
  insertedLastRun,
  lookbackDays,
  maxLookbackDays,
  minLookbackDays,
  nextDueAt,
  oneTimeAt,
  oneTimeAtLocalDefault,
  oneTimeDueNow,
  saveOneTimeAction,
  saveScheduleAction,
  scheduleSettings,
  scheduleState,
  settingsUnavailable,
  updatedLastRun,
}: {
  clearOneTimeAction: JobsFormAction;
  insertedLastRun: number | null;
  lookbackDays: number;
  maxLookbackDays: number;
  minLookbackDays: number;
  nextDueAt: Date | null;
  oneTimeAt: Date | null;
  oneTimeAtLocalDefault: string;
  oneTimeDueNow: boolean;
  saveOneTimeAction: JobsFormAction;
  saveScheduleAction: JobsFormAction;
  scheduleSettings: JobsScrapeScheduleSettings;
  scheduleState: JobsScrapeScheduleState;
  settingsUnavailable: boolean;
  updatedLastRun: number | null;
}) {
  const timezone = scheduleSettings.timezone;
  return (
    <JobsSectionCard
      description="When the project scraper runs on its own, plus one-off runs."
      meta={
        <AdminStatusPill tone={scheduleSettings.enabled ? "success" : "neutral"}>
          {scheduleSettings.enabled ? "On" : "Off"}
        </AdminStatusPill>
      }
      title="Auto scrape schedule"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {settingsUnavailable ? (
            <AdminNotice>
              Job scrape settings could not be confirmed. Save controls are
              disabled so fallback defaults are not written back accidentally.
            </AdminNotice>
          ) : null}
          <form action={saveScheduleAction} className="grid gap-4 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-2 font-medium text-sm sm:col-span-2">
              <input
                className="cursor-pointer"
                defaultChecked={scheduleSettings.enabled}
                name="autoScrapeEnabled"
                type="checkbox"
                value="true"
              />
              Enable automatic scraping
            </label>
            <label className={LABEL_CLASS}>
              Interval (hours)
              <input
                className={JOBS_INPUT_CLASS}
                defaultValue={scheduleSettings.intervalHours}
                max={168}
                min={1}
                name="intervalHours"
                required
                type="number"
              />
            </label>
            <label className={LABEL_CLASS}>
              Lookback days
              <input
                className={JOBS_INPUT_CLASS}
                defaultValue={lookbackDays}
                max={maxLookbackDays}
                min={minLookbackDays}
                name="lookbackDays"
                required
                type="number"
              />
            </label>
            <label className={LABEL_CLASS}>
              Preferred start time
              <input
                className={JOBS_INPUT_CLASS}
                defaultValue={scheduleSettings.startTime}
                name="startTime"
                required
                step={60}
                type="time"
              />
            </label>
            <label className={LABEL_CLASS}>
              Timezone
              <select className={SELECT_CLASS} defaultValue={scheduleSettings.timezone} name="timezone">
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="UTC">UTC</option>
              </select>
            </label>
            <div className="sm:col-span-2">
              <ActionSubmitButton
                className="cursor-pointer"
                disabled={settingsUnavailable}
                pendingLabel="Saving..."
                refreshOnSuccess
                successMessage="Auto-scrape schedule saved."
              >
                Save Schedule
              </ActionSubmitButton>
            </div>
          </form>

          <div className="space-y-4 border-t pt-5">
            <form action={saveOneTimeAction} className="grid gap-3">
              <input name="timezone" type="hidden" value={scheduleSettings.timezone} />
              <label className={LABEL_CLASS}>
                One-time scrape date and time ({scheduleSettings.timezone})
                <input
                  className={JOBS_INPUT_CLASS}
                  defaultValue={oneTimeAtLocalDefault}
                  name="oneTimeAtLocal"
                  required
                  type="datetime-local"
                />
              </label>
              <p className="text-muted-foreground text-xs">
                One-time schedules run once on or after the selected time when the
                scheduled background trigger runs. If you pick a past time, it will
                run on the next scheduled trigger.
              </p>
              <div>
                <ActionSubmitButton
                  className="cursor-pointer"
                  disabled={settingsUnavailable}
                  pendingLabel="Saving..."
                  refreshOnSuccess
                  successMessage="One-time scrape scheduled."
                  variant="outline"
                >
                  Save One-Time Schedule
                </ActionSubmitButton>
              </div>
            </form>
            {oneTimeAt ? (
              <form action={clearOneTimeAction}>
                <ActionSubmitButton
                  className="cursor-pointer"
                  disabled={settingsUnavailable}
                  pendingLabel="Clearing..."
                  refreshOnSuccess
                  successMessage="One-time schedule cleared."
                  variant="destructive"
                >
                  Clear One-Time Schedule
                </ActionSubmitButton>
              </form>
            ) : null}
          </div>
        </div>

        <div className="h-fit space-y-4 rounded-lg border bg-muted/20 p-4">
          <DetailList
            items={[
              { label: "Status", value: scheduleState.lastRunStatus ?? "not_started" },
              { label: "Last success", value: formatMaybeDateTime(scheduleState.lastSuccessAt, timezone) },
              { label: "Next auto run at", value: formatMaybeDateTime(nextDueAt, timezone) },
              { label: "Active lock until", value: formatMaybeDateTime(scheduleState.lockUntil, timezone) },
              { label: "Lookback window", value: `${lookbackDays} days` },
              { label: "One-time run at", value: formatMaybeDateTime(oneTimeAt, timezone) },
              oneTimeDueNow
                ? { label: "One-time status", value: "due now (will run on next auto trigger)" }
                : null,
              scheduleState.lastSkipReason
                ? { label: "Last skip reason", value: scheduleState.lastSkipReason }
                : null,
              insertedLastRun !== null ? { label: "Last inserted count", value: insertedLastRun } : null,
              updatedLastRun !== null ? { label: "Last updated count", value: updatedLastRun } : null,
            ]}
          />
          <div className="border-t pt-3 text-muted-foreground text-xs">
            <JobsAutoScrapeStatus />
          </div>
        </div>
      </div>
    </JobsSectionCard>
  );
}

export function JobsPdfSettingsCard({
  pdfExtractionSettings,
  saveAction,
  settingsUnavailable,
}: {
  pdfExtractionSettings: JobsPdfExtractionSettings;
  saveAction: JobsFormAction;
  settingsUnavailable: boolean;
}) {
  return (
    <JobsSectionCard
      description="How job notice PDFs are read when listings are imported."
      meta={<AdminStatusPill>{formatPdfExtractionModeLabel(pdfExtractionSettings.mode)}</AdminStatusPill>}
      title="PDF extraction"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {settingsUnavailable ? (
            <AdminNotice>
              PDF extraction settings could not be confirmed. Save controls are
              disabled until this section can be refreshed with real data.
            </AdminNotice>
          ) : null}
          <form action={saveAction} className="grid gap-4 sm:grid-cols-2">
            <label className={LABEL_CLASS}>
              Extraction mode
              <select className={SELECT_CLASS} defaultValue={pdfExtractionSettings.mode} name="pdfExtractionMode">
                <option value="off">Off</option>
                <option value="hybrid">Hybrid</option>
                <option value="full">Full</option>
              </select>
            </label>
            <label className={LABEL_CLASS}>
              Model ID
              <input
                className={JOBS_INPUT_CLASS}
                defaultValue={pdfExtractionSettings.modelId ?? ""}
                name="pdfExtractionModelId"
                placeholder="gemini-2.5-flash or gemini-3-flash-preview"
                type="text"
              />
            </label>
            <p className="text-muted-foreground text-xs sm:col-span-2">
              Off disables LLM use for jobs PDF extraction. Hybrid only calls
              the model when the raw parser looks weak or incomplete. Full
              always attempts model-based extraction first. Leaving Model ID
              blank uses the server default.
            </p>
            <div className="sm:col-span-2">
              <ActionSubmitButton
                className="cursor-pointer"
                disabled={settingsUnavailable}
                pendingLabel="Saving..."
                refreshOnSuccess
                successMessage="PDF extraction settings saved."
              >
                Save PDF Extraction Settings
              </ActionSubmitButton>
            </div>
          </form>
        </div>
        <div className="h-fit rounded-lg border bg-muted/20 p-4">
          <DetailList
            items={[
              { label: "Current mode", value: formatPdfExtractionModeLabel(pdfExtractionSettings.mode) },
              { label: "Manual model", value: pdfExtractionSettings.modelId ?? "Server default" },
              { label: "Effective model", value: pdfExtractionSettings.effectiveModelId },
            ]}
          />
        </div>
      </div>
    </JobsSectionCard>
  );
}

export function JobsManualEntryCard({ createAction }: { createAction: JobsFormAction }) {
  return (
    <JobsSectionCard
      description="You can add jobs manually. These entries are stored in the same Supabase jobs table."
      title="Manual job entry"
    >
      <form action={createAction} className="grid gap-4 md:grid-cols-2">
        <label className={LABEL_CLASS}>
          Title
          <input className={JOBS_INPUT_CLASS} name="title" placeholder="Software Engineer" required />
        </label>
        <label className={LABEL_CLASS}>
          Company
          <input className={JOBS_INPUT_CLASS} name="company" placeholder="Acme Pvt Ltd" required />
        </label>
        <label className={LABEL_CLASS}>
          Location
          <input className={JOBS_INPUT_CLASS} name="location" placeholder="Shillong, Meghalaya" required />
        </label>
        <label className={LABEL_CLASS}>
          Source URL (optional)
          <input
            className={JOBS_INPUT_CLASS}
            name="sourceUrl"
            placeholder="https://example.com/job-post"
            type="url"
          />
        </label>
        <label className={cn(LABEL_CLASS, "md:col-span-2")}>
          Description
          <textarea
            className="min-h-28 w-full rounded-lg border border-input bg-background px-3 py-2 font-normal text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            name="description"
            placeholder="Job description..."
          />
        </label>
        <label className={LABEL_CLASS}>
          Status
          <select className={SELECT_CLASS} defaultValue="active" name="status">
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </label>
        <div className="md:col-span-2">
          <ActionSubmitButton
            className="cursor-pointer"
            pendingLabel="Adding..."
            refreshOnSuccess
            successMessage="Manual job added."
          >
            Add Job Manually
          </ActionSubmitButton>
        </div>
      </form>
    </JobsSectionCard>
  );
}
