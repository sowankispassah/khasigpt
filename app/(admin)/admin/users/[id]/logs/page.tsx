import { notFound } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";

import { listAuditLog, getUserById } from "@/lib/db/queries";
import { SessionUsageChatLink } from "@/components/session-usage-chat-link";

export const dynamic = "force-dynamic";

function truncate(value: string | null, max = 140) {
  if (!value) return "—";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export default async function AdminUserLogsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUserById(id);
  if (!user) {
    notFound();
  }

  const auditEntries = await listAuditLog({
    userId: id,
    limit: 200,
  });

  const firstSeen = auditEntries.at(-1)?.createdAt ?? user.createdAt;
  const lastSeen = auditEntries.at(0)?.createdAt ?? user.createdAt;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">User activity</h2>
          <p className="text-muted-foreground text-sm">
            Recent sign-ups, logins, and account changes for {user.email}
          </p>
        </div>
        <SessionUsageChatLink className="cursor-pointer" href="/admin/users">
          <span className="inline-flex items-center rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold hover:bg-accent">
            Back to users
          </span>
        </SessionUsageChatLink>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Account
          </p>
          <p className="mt-1 font-semibold">{user.email}</p>
          <p className="text-muted-foreground text-xs">User ID: {user.id}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Last activity
          </p>
          <p className="mt-1 font-semibold">
            {format(new Date(lastSeen), "MMM d, yyyy • h:mm a")}
          </p>
          <p className="text-muted-foreground text-xs">
            {formatDistanceToNow(new Date(lastSeen), { addSuffix: true })}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                First seen
              </p>
              <p className="mt-1 font-semibold">
                {format(new Date(firstSeen), "MMM d, yyyy")}
              </p>
              <p className="text-muted-foreground text-xs">
                {formatDistanceToNow(new Date(firstSeen), { addSuffix: true })}
              </p>
            </div>
            <SessionUsageChatLink
              className="cursor-pointer text-sm font-semibold text-primary underline-offset-4 hover:underline"
              href={`/admin/users/${user.id}/logs`}
            >
              Refresh
            </SessionUsageChatLink>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="text-sm font-semibold">
            {auditEntries.length} recent events
          </div>
          <span className="rounded-md bg-muted px-3 py-1 text-xs text-muted-foreground">
            IP · Device · User agent captured
          </span>
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-[15%] px-4 py-3 text-left">Timestamp</th>
                <th className="w-[12%] px-4 py-3 text-left">Action</th>
                <th className="w-[8%] px-4 py-3 text-left">IP</th>
                <th className="w-[10%] px-4 py-3 text-left">Device</th>
                <th className="w-[40%] px-4 py-3 text-left">User agent</th>
                <th className="w-[15%] px-4 py-3 text-left">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {auditEntries.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-muted-foreground" colSpan={6}>
                    No audit entries yet.
                  </td>
                </tr>
              ) : (
                auditEntries.map((entry) => {
                  const createdAt = new Date(entry.createdAt);
                  return (
                    <tr
                      key={entry.id}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                        <div>{format(createdAt, "MMM d, yyyy • h:mm a")}</div>
                        <div>{formatDistanceToNow(createdAt, { addSuffix: true })}</div>
                      </td>
                      <td className="px-4 py-3 align-top font-medium">
                        {entry.action}
                      </td>
                      <td className="px-4 py-3 align-top font-mono text-xs">
                        {entry.ipAddress ?? "—"}
                      </td>
                      <td className="px-4 py-3 align-top capitalize">
                        {entry.device ?? "—"}
                      </td>
                      <td
                        className="px-4 py-3 align-top whitespace-pre-line break-words text-xs"
                        title={entry.userAgent ?? undefined}
                      >
                        {truncate(entry.userAgent ?? null, 260)}
                      </td>
                      <td className="px-4 py-3 align-top whitespace-pre-wrap break-words text-xs text-muted-foreground">
                        {entry.metadata
                          ? truncate(JSON.stringify(entry.metadata), 160)
                          : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile stacked cards */}
        <div className="space-y-3 p-4 md:hidden">
          {auditEntries.length === 0 ? (
            <div className="text-muted-foreground text-sm">No audit entries yet.</div>
          ) : (
            auditEntries.map((entry) => {
              const createdAt = new Date(entry.createdAt);
              return (
                <div
                  key={entry.id}
                  className="rounded-lg border bg-background/60 p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs text-muted-foreground">
                      <div>{format(createdAt, "MMM d, yyyy • h:mm a")}</div>
                      <div>{formatDistanceToNow(createdAt, { addSuffix: true })}</div>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold">
                      {entry.action}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase text-muted-foreground">IP</span>
                      <span className="font-mono text-xs">{entry.ipAddress ?? "—"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase text-muted-foreground">
                        Device
                      </span>
                      <span className="capitalize">{entry.device ?? "—"}</span>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">User agent</p>
                      <p className="whitespace-pre-line break-words text-xs">
                        {entry.userAgent ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Metadata</p>
                      <p className="break-words text-xs text-muted-foreground">
                        {entry.metadata
                          ? JSON.stringify(entry.metadata)
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
