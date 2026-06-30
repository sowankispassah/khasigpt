import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { Suspense } from "react";

import { AdminDataPanel } from "@/components/admin-data-panel";
import { AdminLiveActivityPanelDeferred } from "@/components/admin-live-activity-panel-deferred";
import {
  type AdminQueryResult,
  adminQueryResult,
} from "@/lib/admin/safe-query";
import {
  type AdminOverviewSnapshot,
  getAdminOverviewSnapshot,
} from "@/lib/db/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type OverviewSnapshotResult = AdminQueryResult<AdminOverviewSnapshot>;

const EMPTY_ADMIN_OVERVIEW_SNAPSHOT: AdminOverviewSnapshot = {
  chatCount: 0,
  contactMessageCount: 0,
  recentAudits: [],
  recentChats: [],
  recentContactMessages: [],
  recentUsers: [],
  userCount: 0,
};

function adminOverviewQuery<T>(
  label: string,
  promise: Promise<T>,
  fallback: T
) {
  return adminQueryResult({
    fallback,
    label,
    promise,
  });
}

export default function AdminOverviewPage() {
  const overviewSnapshotPromise = adminOverviewQuery(
    "overview.snapshot",
    getAdminOverviewSnapshot(),
    EMPTY_ADMIN_OVERVIEW_SNAPSHOT
  );

  return (
    <div className="flex flex-col gap-10">
      <Suspense fallback={<OverviewMetricsFallback />}>
        <AdminOverviewMetricsSection
          overviewSnapshotPromise={overviewSnapshotPromise}
        />
      </Suspense>

      <AdminLiveActivityPanelDeferred />

      <section className="grid items-stretch gap-8 xl:grid-cols-2">
        <Suspense
          fallback={<AdminDataPanelFallback rows={5} title="Newest users" />}
        >
          <NewestUsersPanel overviewSnapshotPromise={overviewSnapshotPromise} />
        </Suspense>

        <Suspense
          fallback={
            <AdminDataPanelFallback rows={5} title="Latest contact requests" />
          }
        >
          <LatestContactRequestsPanel
            overviewSnapshotPromise={overviewSnapshotPromise}
          />
        </Suspense>
      </section>

      <Suspense
        fallback={<AdminDataPanelFallback rows={5} title="Latest chats" />}
      >
        <LatestChatsPanel overviewSnapshotPromise={overviewSnapshotPromise} />
      </Suspense>

      <Suspense
        fallback={
          <AdminDataPanelFallback rows={5} title="Recent audit activity" />
        }
      >
        <RecentAuditActivityPanel
          overviewSnapshotPromise={overviewSnapshotPromise}
        />
      </Suspense>
    </div>
  );
}

async function AdminOverviewMetricsSection({
  overviewSnapshotPromise,
}: {
  overviewSnapshotPromise: Promise<OverviewSnapshotResult>;
}) {
  const overviewSnapshotResult = await overviewSnapshotPromise;
  const overview = overviewSnapshotResult.data;
  const degraded = !overviewSnapshotResult.ok;

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
          confirmed={overviewSnapshotResult.ok}
          label="Total users"
          value={overview.userCount}
        />
        <MetricCard
          confirmed={overviewSnapshotResult.ok}
          label="Total chats"
          value={overview.chatCount}
        />
        <MetricCard
          confirmed={overviewSnapshotResult.ok}
          description="Last 5 accounts"
          label="Recent users"
          value={overview.recentUsers.length}
        />
        <MetricCard
          confirmed={overviewSnapshotResult.ok}
          description="Last 5 records"
          label="Audit events"
          value={overview.recentAudits.length}
        />
        <MetricCard
          confirmed={overviewSnapshotResult.ok}
          description="Total messages received"
          label="Contact requests"
          value={overview.contactMessageCount}
        />
      </section>
    </>
  );
}

async function NewestUsersPanel({
  overviewSnapshotPromise,
}: {
  overviewSnapshotPromise: Promise<OverviewSnapshotResult>;
}) {
  const overviewSnapshotResult = await overviewSnapshotPromise;
  const recentUsers = overviewSnapshotResult.data.recentUsers;

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
            {!overviewSnapshotResult.ok ? (
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
        {!overviewSnapshotResult.ok ? (
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

async function LatestContactRequestsPanel({
  overviewSnapshotPromise,
}: {
  overviewSnapshotPromise: Promise<OverviewSnapshotResult>;
}) {
  const overviewSnapshotResult = await overviewSnapshotPromise;
  const recentContactMessages =
    overviewSnapshotResult.data.recentContactMessages;

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
            {!overviewSnapshotResult.ok ? (
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
        {!overviewSnapshotResult.ok ? (
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

async function LatestChatsPanel({
  overviewSnapshotPromise,
}: {
  overviewSnapshotPromise: Promise<OverviewSnapshotResult>;
}) {
  const overviewSnapshotResult = await overviewSnapshotPromise;
  const recentChats = overviewSnapshotResult.data.recentChats;

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
            {!overviewSnapshotResult.ok ? (
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
        {!overviewSnapshotResult.ok ? (
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

async function RecentAuditActivityPanel({
  overviewSnapshotPromise,
}: {
  overviewSnapshotPromise: Promise<OverviewSnapshotResult>;
}) {
  const overviewSnapshotResult = await overviewSnapshotPromise;
  const recentAudits = overviewSnapshotResult.data.recentAudits;

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
            {!overviewSnapshotResult.ok ? (
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
        {!overviewSnapshotResult.ok ? (
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

function OverviewMetricsFallback() {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          className="h-24 animate-pulse rounded-lg border bg-card"
          key={`admin-overview-metric-${index + 1}`}
        />
      ))}
    </section>
  );
}

function AdminDataPanelFallback({
  rows,
  title,
}: {
  rows: number;
  title: string;
}) {
  return (
    <AdminDataPanel title={title}>
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, index) => (
          <div
            className="h-12 animate-pulse rounded-lg bg-muted/50"
            key={`${title}-loading-${index + 1}`}
          />
        ))}
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
  value: number;
  description?: string;
  confirmed?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-muted-foreground text-xs uppercase">{label}</p>
      <p className="mt-2 font-semibold text-2xl">
        {confirmed ? value : "Unavailable"}
      </p>
      {description ? (
        <p className="text-muted-foreground text-xs">
          {confirmed ? description : "Unable to confirm from database"}
        </p>
      ) : null}
    </div>
  );
}
