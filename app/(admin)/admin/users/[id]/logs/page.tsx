import { format, formatDistanceToNow } from "date-fns";
import { notFound } from "next/navigation";
import { SessionUsageChatLink } from "@/components/session-usage-chat-link";
import { getUserById, listAuditLog } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

function truncate(value: string | null, max = 140) {
  if (!value) {
    return "—";
  }
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export default async function AdminUserLogsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ offset?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const offsetParam = resolvedSearchParams?.offset ?? "0";
  const offset = Number.parseInt(offsetParam, 10);
  const safeOffset = Number.isFinite(offset) && offset > 0 ? offset : 0;
  const pageSize = 10;

  const user = await getUserById(id);
  if (!user) {
    notFound();
  }

  const auditEntries = await listAuditLog({
    userId: id,
    limit: pageSize,
    offset: safeOffset,
  });
  const hasMore = auditEntries.length === pageSize;
  const hasPrev = safeOffset > 0;
  const nextOffset = safeOffset + pageSize;
  const prevOffset = Math.max(0, safeOffset - pageSize);

  const firstSeen = auditEntries.at(-1)?.createdAt ?? user.createdAt;
  const lastSeen = auditEntries.at(0)?.createdAt ?? user.createdAt;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-semibold text-xl">User activity</h2>
          <p className="text-muted-foreground text-sm">
            Recent sign-ups, logins, and account changes for {user.email}
          </p>
        </div>
        <SessionUsageChatLink className="cursor-pointer" href="/admin/users">
          <span className="inline-flex items-center rounded-md border border-input bg-background px-3 py-2 font-semibold text-sm hover:bg-accent">
            Back to users
          </span>
        </SessionUsageChatLink>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
            Account
          </p>
          <p className="mt-1 font-semibold">{user.email}</p>
          <p className="text-muted-foreground text-xs">User ID: {user.id}</p>
        </div>
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
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
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
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
              className="cursor-pointer font-semibold text-primary text-sm underline-offset-4 hover:underline"
              href={`/admin/users/${user.id}/logs?offset=${safeOffset}`}
            >
              Refresh
            </SessionUsageChatLink>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="font-semibold text-sm">
            {auditEntries.length} recent events
          </div>
          <span className="rounded-md bg-muted px-3 py-1 text-muted-foreground text-xs">
            IP · Device · User agent captured
          </span>
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-muted/50 text-[11px] text-muted-foreground uppercase tracking-wide">
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
                      className="border-b last:border-0 hover:bg-muted/30"
                      key={entry.id}
                    >
                      <td className="px-4 py-3 align-top text-muted-foreground text-xs">
                        <div>{format(createdAt, "MMM d, yyyy • h:mm a")}</div>
                        <div>
                          {formatDistanceToNow(createdAt, { addSuffix: true })}
                        </div>
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
                        className="whitespace-pre-line break-words px-4 py-3 align-top text-xs"
                        title={entry.userAgent ?? undefined}
                      >
                        {truncate(entry.userAgent ?? null, 260)}
                      </td>
                      <td className="whitespace-pre-wrap break-words px-4 py-3 align-top text-muted-foreground text-xs">
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
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
            <SessionUsageChatLink
              className="font-semibold text-primary underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-50"
              href={`/admin/users/${user.id}/logs?offset=${prevOffset}`}
            >
              {hasPrev ? "Previous 10" : ""}
            </SessionUsageChatLink>
            <SessionUsageChatLink
              className="font-semibold text-primary underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-50"
              href={`/admin/users/${user.id}/logs?offset=${nextOffset}`}
            >
              {hasMore ? "Next 10" : ""}
            </SessionUsageChatLink>
          </div>
        </div>

        {/* Mobile stacked cards */}
        <div className="space-y-3 p-4 md:hidden">
          {auditEntries.length === 0 ? (
            <div className="text-muted-foreground text-sm">
              No audit entries yet.
            </div>
          ) : (
            auditEntries.map((entry) => {
              const createdAt = new Date(entry.createdAt);
              return (
                <div
                  className="rounded-lg border bg-background/60 p-3 shadow-sm"
                  key={entry.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-muted-foreground text-xs">
                      <div>{format(createdAt, "MMM d, yyyy • h:mm a")}</div>
                      <div>
                        {formatDistanceToNow(createdAt, { addSuffix: true })}
                      </div>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-1 font-semibold text-[11px]">
                      {entry.action}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs uppercase">
                        IP
                      </span>
                      <span className="font-mono text-xs">
                        {entry.ipAddress ?? "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs uppercase">
                        Device
                      </span>
                      <span className="capitalize">{entry.device ?? "—"}</span>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs uppercase">
                        User agent
                      </p>
                      <p className="whitespace-pre-line break-words text-xs">
                        {entry.userAgent ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs uppercase">
                        Metadata
                      </p>
                      <p className="break-words text-muted-foreground text-xs">
                        {entry.metadata ? JSON.stringify(entry.metadata) : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div className="flex items-center justify-between pt-1 text-sm">
            <SessionUsageChatLink
              className="font-semibold text-primary underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-50"
              href={`/admin/users/${user.id}/logs?offset=${prevOffset}`}
            >
              {hasPrev ? "Previous 10" : ""}
            </SessionUsageChatLink>
            <SessionUsageChatLink
              className="font-semibold text-primary underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-50"
              href={`/admin/users/${user.id}/logs?offset=${nextOffset}`}
            >
              {hasMore ? "Next 10" : ""}
            </SessionUsageChatLink>
          </div>
        </div>
      </div>
    </div>
  );
}
