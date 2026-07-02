import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

import { AdminDataPanel } from "@/components/admin-data-panel";
import { AdminLiveActivityPanelDeferred } from "@/components/admin-live-activity-panel-deferred";
import {
  type AdminQueryResult,
  adminQueryResult,
} from "@/lib/admin/safe-query";
import {
  type AdminOverviewAudit,
  type AdminOverviewChat,
  type AdminOverviewContactMessage,
  type AdminOverviewSnapshot,
  type AdminOverviewUser,
  getAdminOverviewSnapshot,
} from "@/lib/db/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const EMPTY_ADMIN_OVERVIEW_SNAPSHOT: AdminOverviewSnapshot = {
  userCount: 0,
  chatCount: 0,
  contactMessageCount: 0,
  recentUsers: [],
  recentChats: [],
  recentAudits: [],
  recentContactMessages: [],
};

function adminOverviewQuery<T>(
  label: string,
  load: () => Promise<T>,
  fallback: T
) {
  return adminQueryResult({
    fallback,
    label,
    promise: load(),
  });
}

type SnapshotPanelResult<T> = AdminQueryResult<T>;
type AdminOverviewSnapshotResult = AdminQueryResult<AdminOverviewSnapshot>;

function snapshotPanelResult<T>(
  overviewResult: AdminOverviewSnapshotResult,
  select: (snapshot: AdminOverviewSnapshot) => T
): SnapshotPanelResult<T> {
  if (overviewResult.ok) {
    return {
      data: select(overviewResult.data),
      error: null,
      ok: true,
    };
  }

  return {
    data: select(overviewResult.data),
    error: overviewResult.error,
    ok: false,
  };
}

export default async function AdminOverviewPage() {
  const overviewResult = await adminOverviewQuery<AdminOverviewSnapshot>(
    "overview.snapshot",
    getAdminOverviewSnapshot,
    EMPTY_ADMIN_OVERVIEW_SNAPSHOT
  );

  return (
    <div className="flex flex-col gap-10">
      <AdminOverviewMetricsSection overviewResult={overviewResult} />

      <AdminLiveActivityPanelDeferred />

      <section className="grid items-stretch gap-8 xl:grid-cols-2">
        <NewestUsersPanel overviewResult={overviewResult} />

        <LatestContactRequestsPanel overviewResult={overviewResult} />
      </section>

      <LatestChatsPanel overviewResult={overviewResult} />

      <RecentAuditActivityPanel overviewResult={overviewResult} />
    </div>
  );
}

function AdminOverviewMetricsSection({
  overviewResult,
}: {
  overviewResult: AdminOverviewSnapshotResult;
}) {
  const degraded = !overviewResult.ok;
  const snapshot = overviewResult.data;

  return (
    <>
      {degraded ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 text-sm">
          <p className="font-semibold">
            Admin overview data could not be fully confirmed.
          </p>
          <p className="mt-1">
            Unavailable metrics are not replaced with zero. Other panels continue
            loading independently.
          </p>
        </div>
      ) : null}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          confirmed={overviewResult.ok}
          label="Total users"
          value={snapshot.userCount}
        />
        <MetricCard
          confirmed={overviewResult.ok}
          label="Total chats"
          value={snapshot.chatCount}
        />
        <MetricCard
          confirmed={overviewResult.ok}
          description="Last 5 accounts"
          label="Recent users"
          value={overviewResult.ok ? snapshot.recentUsers.length : null}
        />
        <MetricCard
          confirmed={overviewResult.ok}
          description="Last 5 records"
          label="Audit events"
          value={overviewResult.ok ? snapshot.recentAudits.length : null}
        />
        <MetricCard
          confirmed={overviewResult.ok}
          description="Total messages received"
          label="Contact requests"
          value={snapshot.contactMessageCount}
        />
      </section>
    </>
  );
}

function NewestUsersPanel({
  overviewResult,
}: {
  overviewResult: AdminOverviewSnapshotResult;
}) {
  const recentUsersResult = snapshotPanelResult<AdminOverviewUser[]>(
    overviewResult,
    (snapshot) => snapshot.recentUsers
  );
  const recentUsers = recentUsersResult.data;

  return (
    <AdminDataPanel title="Newest users">
      <div className="hidden md:block">
        <table className="w-full min-w-[640px] table-fixed text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Email</th>
              <th className="px-4 py-3 text-left font-medium">Role</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 text-sm">
            {!recentUsersResult.ok ? (
              <UnconfirmedTableRow colSpan={4} />
            ) : recentUsers.length === 0 ? (
              <EmptyTableRow colSpan={4} message="No users found." />
            ) : (
              recentUsers.map((user) => (
                <tr
                  className="bg-card/70 transition hover:bg-muted/20"
                  key={user.id}
                >
                  <td className="px-4 py-3">
                    <span className="block truncate font-medium">
                      {user.email}
                    </span>
                  </td>
                  <td className="px-4 py-3 capitalize">{user.role}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 font-semibold text-xs",
                        user.isActive
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      )}
                    >
                      {user.isActive ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {formatDistanceToNow(new Date(user.createdAt), {
                      addSuffix: true,
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 text-sm md:hidden">
        {!recentUsersResult.ok ? (
          <UnconfirmedPanelMessage />
        ) : recentUsers.length === 0 ? (
          <EmptyPanelMessage message="No users found." />
        ) : (
          recentUsers.map((user) => (
            <div
              className="rounded-lg border border-border/70 bg-card/70 p-4 shadow-sm"
              key={user.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="font-semibold">{user.email}</span>
                  <span className="text-muted-foreground text-xs">
                    Joined{" "}
                    {formatDistanceToNow(new Date(user.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 font-semibold text-xs",
                    user.isActive
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  )}
                >
                  {user.isActive ? "Active" : "Suspended"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground uppercase tracking-wide">
                    Role
                  </p>
                  <p className="mt-1 font-medium capitalize">{user.role}</p>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase tracking-wide">
                    User ID
                  </p>
                  <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                    {user.id}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </AdminDataPanel>
  );
}

function LatestContactRequestsPanel({
  overviewResult,
}: {
  overviewResult: AdminOverviewSnapshotResult;
}) {
  const recentContactMessagesResult = snapshotPanelResult<
    AdminOverviewContactMessage[]
  >(
    overviewResult,
    (snapshot) => snapshot.recentContactMessages
  );
  const recentContactMessages = recentContactMessagesResult.data;

  return (
    <AdminDataPanel title="Latest contact requests">
      <div className="hidden md:block">
        <table className="w-full min-w-[680px] table-fixed text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Subject</th>
              <th className="px-4 py-3 text-left font-medium">From</th>
              <th className="px-4 py-3 text-left font-medium">Phone</th>
              <th className="px-4 py-3 text-left font-medium">Received</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 text-sm">
            {!recentContactMessagesResult.ok ? (
              <UnconfirmedTableRow colSpan={4} />
            ) : recentContactMessages.length === 0 ? (
              <EmptyTableRow colSpan={4} message="No contact requests yet." />
            ) : (
              recentContactMessages.map((message) => (
                <tr
                  className="bg-card/70 transition hover:bg-muted/20"
                  key={message.id}
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold">{message.subject}</div>
                    <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
                      {message.message}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{message.name}</div>
                    <span className="text-muted-foreground text-xs">
                      {message.email}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {message.phone ? message.phone : "N/A"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {formatDistanceToNow(new Date(message.createdAt), {
                      addSuffix: true,
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 text-sm md:hidden">
        {!recentContactMessagesResult.ok ? (
          <UnconfirmedPanelMessage />
        ) : recentContactMessages.length === 0 ? (
          <EmptyPanelMessage message="No contact requests yet." />
        ) : (
          recentContactMessages.map((message) => (
            <div
              className="rounded-lg border border-border/70 bg-card/70 p-4 shadow-sm"
              key={message.id}
            >
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs uppercase">
                  {formatDistanceToNow(new Date(message.createdAt), {
                    addSuffix: true,
                  })}
                </span>
                <h3 className="font-semibold text-base">{message.subject}</h3>
                <p className="text-muted-foreground text-xs">
                  {message.message}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
                <div>
                  <p className="text-muted-foreground uppercase tracking-wide">
                    From
                  </p>
                  <p className="mt-1 font-medium">{message.name}</p>
                  <p className="text-muted-foreground">{message.email}</p>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase tracking-wide">
                    Phone
                  </p>
                  <p className="mt-1 font-semibold">
                    {message.phone ? message.phone : "N/A"}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </AdminDataPanel>
  );
}

function LatestChatsPanel({
  overviewResult,
}: {
  overviewResult: AdminOverviewSnapshotResult;
}) {
  const recentChatsResult = snapshotPanelResult<AdminOverviewChat[]>(
    overviewResult,
    (snapshot) => snapshot.recentChats
  );
  const recentChats = recentChatsResult.data;

  return (
    <AdminDataPanel title="Latest chats">
      <div className="hidden md:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Chat</th>
              <th className="px-4 py-3 text-left font-medium">Owner</th>
              <th className="px-4 py-3 text-left font-medium">Visibility</th>
              <th className="px-4 py-3 text-left font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 text-sm">
            {!recentChatsResult.ok ? (
              <UnconfirmedTableRow colSpan={4} />
            ) : recentChats.length === 0 ? (
              <EmptyTableRow colSpan={4} message="No chats found." />
            ) : (
              recentChats.map((chat) => (
                <tr
                  className="bg-card/70 transition hover:bg-muted/20"
                  key={chat.id}
                >
                  <td className="px-4 py-3">
                    <Link
                      className="line-clamp-1 cursor-pointer font-semibold text-primary hover:underline"
                      href={`/chat/${chat.id}?admin=1`}
                      title={`${chat.title || "Untitled chat"} - ${chat.id}`}
                    >
                      {chat.title || "Untitled chat"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="block truncate"
                      title={chat.userEmail ?? chat.userId}
                    >
                      {chat.userEmail ?? chat.userId}
                    </span>
                  </td>
                  <td className="px-4 py-3 capitalize">
                    <span className="rounded-full bg-secondary px-3 py-1 font-medium text-secondary-foreground text-xs">
                      {chat.visibility}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {formatDistanceToNow(new Date(chat.createdAt), {
                      addSuffix: true,
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 text-sm md:hidden">
        {!recentChatsResult.ok ? (
          <UnconfirmedPanelMessage />
        ) : recentChats.length === 0 ? (
          <EmptyPanelMessage message="No chats found." />
        ) : (
          recentChats.map((chat) => (
            <Link
              className="cursor-pointer rounded-lg border border-border/70 bg-card/70 p-4 shadow-sm transition hover:bg-muted/20"
              href={`/chat/${chat.id}?admin=1`}
              key={chat.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="line-clamp-1 font-semibold">
                  {chat.title || "Untitled chat"}
                </p>
                <span className="rounded-full bg-secondary px-3 py-1 font-medium text-secondary-foreground text-xs capitalize">
                  {chat.visibility}
                </span>
              </div>
              <div className="mt-2 text-muted-foreground text-xs">
                <p className="truncate" title={chat.userEmail ?? chat.userId}>
                  {chat.userEmail ?? chat.userId}
                </p>
                <p className="mt-1">
                  Created{" "}
                  {formatDistanceToNow(new Date(chat.createdAt), {
                    addSuffix: true,
                  })}
                </p>
              </div>
            </Link>
          ))
        )}
      </div>
    </AdminDataPanel>
  );
}

function RecentAuditActivityPanel({
  overviewResult,
}: {
  overviewResult: AdminOverviewSnapshotResult;
}) {
  const recentAuditsResult = snapshotPanelResult<AdminOverviewAudit[]>(
    overviewResult,
    (snapshot) => snapshot.recentAudits
  );
  const recentAudits = recentAuditsResult.data;

  return (
    <AdminDataPanel title="Recent audit activity">
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground text-xs uppercase">
            <tr>
              <th className="py-2 text-left">Action</th>
              <th className="py-2 text-left">Actor</th>
              <th className="py-2 text-left">Target</th>
              <th className="py-2 text-left">When</th>
            </tr>
          </thead>
          <tbody>
            {!recentAuditsResult.ok ? (
              <UnconfirmedTableRow colSpan={4} />
            ) : recentAudits.length === 0 ? (
              <EmptyTableRow colSpan={4} message="No audit events found." />
            ) : (
              recentAudits.map((entry) => (
                <tr className="border-t text-sm" key={entry.id}>
                  <td className="py-2 font-medium">{entry.action}</td>
                  <td className="py-2">{entry.actorId}</td>
                  <td className="py-2 text-muted-foreground text-xs">
                    {JSON.stringify(entry.target)}
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {formatDistanceToNow(new Date(entry.createdAt), {
                      addSuffix: true,
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 text-sm md:hidden">
        {!recentAuditsResult.ok ? (
          <UnconfirmedPanelMessage />
        ) : recentAudits.length === 0 ? (
          <EmptyPanelMessage message="No audit events found." />
        ) : (
          recentAudits.map((entry) => (
            <div
              className="rounded-lg border border-border/70 bg-card/70 p-4 shadow-sm"
              key={entry.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{entry.action}</p>
                <span className="text-muted-foreground text-xs">
                  {formatDistanceToNow(new Date(entry.createdAt), {
                    addSuffix: true,
                  })}
                </span>
              </div>
              <div className="mt-2 text-muted-foreground text-xs">
                <p>
                  <span className="font-semibold text-foreground">Actor:</span>{" "}
                  {entry.actorId}
                </p>
                <p className="mt-1 break-words font-mono text-[11px] leading-snug">
                  {JSON.stringify(entry.target)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </AdminDataPanel>
  );
}

function EmptyTableRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td className="px-4 py-8 text-center text-muted-foreground" colSpan={colSpan}>
        {message}
      </td>
    </tr>
  );
}

function EmptyPanelMessage({ message }: { message: string }) {
  return <p className="py-6 text-center text-muted-foreground">{message}</p>;
}

function UnconfirmedTableRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td
        className="px-4 py-8 text-center text-muted-foreground"
        colSpan={colSpan}
      >
        Unable to confirm this data from the database right now.
      </td>
    </tr>
  );
}

function UnconfirmedPanelMessage() {
  return (
    <p className="py-6 text-center text-muted-foreground">
      Unable to confirm this data from the database right now.
    </p>
  );
}

function MetricCard({
  label,
  value,
  description,
  confirmed = true,
}: {
  label: string;
  value: number | null;
  description?: string;
  confirmed?: boolean;
}) {
  const hasConfirmedValue = confirmed && typeof value === "number";

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-muted-foreground text-xs uppercase">{label}</p>
      <p className="mt-2 font-semibold text-2xl">
        {hasConfirmedValue ? value : "Unavailable"}
      </p>
      {description ? (
        <p className="text-muted-foreground text-xs">
          {hasConfirmedValue ? description : "Unable to confirm from database"}
        </p>
      ) : null}
    </div>
  );
}
