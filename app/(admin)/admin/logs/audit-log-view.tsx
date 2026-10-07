import { formatDistanceToNow } from "date-fns";

import { AdminEmptyState, AdminStatusPill } from "@/components/admin/admin-ui";
import type { AuditLog } from "@/lib/db/schema";

const absoluteFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "medium",
});

function formatValue(value: unknown) {
  if (value === null || value === undefined) {
    return "—";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

/** Short "key: value" pairs for a JSON target, falling back to raw JSON. */
function summarizeTarget(target: unknown) {
  if (target && typeof target === "object" && !Array.isArray(target)) {
    return Object.entries(target as Record<string, unknown>).map(
      ([key, value]) => ({ key, value: formatValue(value) })
    );
  }
  return [{ key: "", value: formatValue(target) }];
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2 font-mono text-[11px] leading-5">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function TargetSummary({ target }: { target: unknown }) {
  const pairs = summarizeTarget(target);
  return (
    <div className="flex flex-wrap gap-1">
      {pairs.slice(0, 3).map((pair) => (
        <span
          className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-xs"
          key={`${pair.key}:${pair.value}`}
          title={pair.value}
        >
          {pair.key ? <span className="text-muted-foreground">{pair.key}</span> : null}
          <span className="max-w-[10rem] truncate font-mono">{pair.value}</span>
        </span>
      ))}
      {pairs.length > 3 ? (
        <span className="text-muted-foreground text-xs">+{pairs.length - 3}</span>
      ) : null}
    </div>
  );
}

export function AuditLogTable({
  entries,
  entriesConfirmed,
}: {
  entries: AuditLog[];
  entriesConfirmed: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-muted-foreground text-xs">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium" scope="col">
              Action
            </th>
            <th className="hidden px-4 py-2.5 text-left font-medium md:table-cell" scope="col">
              Target
            </th>
            <th className="hidden px-4 py-2.5 text-left font-medium lg:table-cell" scope="col">
              Actor
            </th>
            <th className="hidden px-4 py-2.5 text-left font-medium xl:table-cell" scope="col">
              Source
            </th>
            <th className="hidden px-4 py-2.5 text-left font-medium sm:table-cell" scope="col">
              When
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {!entriesConfirmed ? (
            <tr>
              <td colSpan={5}>
                <AdminEmptyState title="Unable to load audit entries." />
              </td>
            </tr>
          ) : entries.length === 0 ? (
            <tr>
              <td colSpan={5}>
                <AdminEmptyState title="No audit entries available yet." />
              </td>
            </tr>
          ) : (
            entries.map((entry) => <AuditLogRow entry={entry} key={entry.id} />)
          )}
        </tbody>
      </table>
    </div>
  );
}

function AuditLogRow({ entry }: { entry: AuditLog }) {
  const createdAt = new Date(entry.createdAt);
  const relative = formatDistanceToNow(createdAt, { addSuffix: true });
  return (
    <tr className="align-top transition hover:bg-muted/30">
      <td className="w-full max-w-0 px-4 py-3 md:w-auto md:max-w-[22rem]">
        <div className="break-words font-medium font-mono text-[13px]">{entry.action}</div>
        <div className="mt-0.5 text-muted-foreground text-xs sm:hidden">
          <time dateTime={createdAt.toISOString()} suppressHydrationWarning>
            {relative}
          </time>
        </div>
        <div className="mt-1.5 md:hidden">
          <TargetSummary target={entry.target} />
        </div>
        <details className="group mt-1.5">
          <summary className="cursor-pointer list-none text-muted-foreground text-xs hover:text-foreground [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Show details</span>
            <span className="hidden group-open:inline">Hide details</span>
          </summary>
          <dl className="mt-2 space-y-2 text-xs">
            <div>
              <dt className="text-muted-foreground">Time</dt>
              <dd>{absoluteFormatter.format(createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Actor</dt>
              <dd className="break-all font-mono">{entry.actorId}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">IP / device</dt>
              <dd>
                {entry.ipAddress ?? "-"} · <span className="capitalize">{entry.device ?? "-"}</span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">User agent</dt>
              <dd className="break-words">{entry.userAgent ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Target</dt>
              <dd>
                <JsonBlock value={entry.target} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Metadata</dt>
              <dd>{entry.metadata ? <JsonBlock value={entry.metadata} /> : "-"}</dd>
            </div>
          </dl>
        </details>
      </td>
      <td className="hidden max-w-[20rem] px-4 py-3 md:table-cell">
        <TargetSummary target={entry.target} />
      </td>
      <td className="hidden px-4 py-3 lg:table-cell">
        <span className="font-mono text-muted-foreground text-xs" title={entry.actorId}>
          {entry.actorId.slice(0, 8)}
        </span>
      </td>
      <td className="hidden px-4 py-3 xl:table-cell">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-mono">{entry.ipAddress ?? "-"}</span>
          {entry.device ? (
            <AdminStatusPill className="capitalize">{entry.device}</AdminStatusPill>
          ) : null}
        </div>
        {entry.userAgent ? (
          <div
            className="mt-0.5 line-clamp-1 max-w-[16rem] break-all text-muted-foreground text-xs"
            title={entry.userAgent}
          >
            {entry.userAgent}
          </div>
        ) : null}
      </td>
      <td className="hidden whitespace-nowrap px-4 py-3 sm:table-cell">
        <time
          dateTime={createdAt.toISOString()}
          suppressHydrationWarning
          title={absoluteFormatter.format(createdAt)}
        >
          {relative}
        </time>
        <div className="text-muted-foreground text-xs">
          {absoluteFormatter.format(createdAt)}
        </div>
      </td>
    </tr>
  );
}
