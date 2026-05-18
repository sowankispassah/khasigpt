import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

import { AdminDataPanel } from "@/components/admin-data-panel";
import { AdminLiveActivityPanelDeferred } from "@/components/admin-live-activity-panel-deferred";
import { adminQueryOr } from "@/lib/admin/safe-query";
import { getAdminOverviewSnapshot } from "@/lib/db/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type QueryResult<T> = {
  data: T;
  durationMs: number;
  label: string;
  ok: boolean;
};

export default async function AdminOverviewPage() {
  const fallbackOverview: Awaited<
    ReturnType<typeof getAdminOverviewSnapshot>
  > = {
    userCount: 0,
    chatCount: 0,
    contactMessageCount: 0,
    recentUsers: [],
    recentChats: [],
    recentAudits: [],
    recentContactMessages: [],
  };

  async function safeQuery<T>(
    label: string,
    promise: Promise<T>,
    fallback: T
  ): Promise<QueryResult<T>> {
    const startedAt = Date.now();
    try {
      const result = await adminQueryOr({
        fallback,
        label,
        promise,
        timeoutMs: 5000,
      });
      const duration = Date.now() - startedAt;
      console.info(`[admin] Query "${label}" succeeded in ${duration}ms.`);
      return {
        data: result,
        durationMs: duration,
        label,
        ok: result !== fallback,
      };
    } catch (error) {
      const duration = Date.now() - startedAt;
      console.error(
        `[admin] Failed to load ${label} after ${duration}ms`,
        error
      );
      return { data: fallback, durationMs: duration, label, ok: false };
    }
  }

  const overviewResult = await safeQuery(
    "overview snapshot",
    getAdminOverviewSnapshot(),
    fallbackOverview
  );
  const userCount = overviewResult.data.userCount;
  const chatCount = overviewResult.data.chatCount;
  const contactMessageCount = overviewResult.data.contactMessageCount;
  const recentUsers = overviewResult.data.recentUsers;
  const recentChats = overviewResult.data.recentChats;
  const recentAudits = overviewResult.data.recentAudits;
  const recentContactMessages = overviewResult.data.recentContactMessages;
  const degradedQueries = overviewResult.ok ? [] : [overviewResult];

  return (
    <div className="flex flex-col gap-10">
      {degradedQueries.length > 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 text-sm">
          <p className="font-semibold">Admin data could not be fully confirmed.</p>
          <p className="mt-1">
            One or more admin reads timed out or failed, so this page is showing
            only confirmed values. Retry shortly; do not treat missing values as
            deleted records.
          </p>
        </div>
      ) : null}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          confirmed={overviewResult.ok}
          label="Total users"
          value={userCount}
        />
        <MetricCard
          confirmed={overviewResult.ok}
          label="Total chats"
          value={chatCount}
        />
        <MetricCard
          confirmed={overviewResult.ok}
          description="Last 5 accounts"
          label="Recent users"
          value={recentUsers.length}
        />
        <MetricCard
          confirmed={overviewResult.ok}
          description="Last 5 records"
          label="Audit events"
          value={recentAudits.length}
        />
        <MetricCard
          confirmed={overviewResult.ok}
          description="Total messages received"
          label="Contact requests"
          value={contactMessageCount}
        />
      </section>

      <AdminLiveActivityPanelDeferred />

      <section className="grid items-stretch gap-8 xl:grid-cols-2">
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
                {overviewResult.ok ? (
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
                ) : (
                  <UnconfirmedTableRow colSpan={4} />
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 text-sm md:hidden">
            {overviewResult.ok ? (
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
            ) : (
              <UnconfirmedPanelMessage />
            )}
          </div>
        </AdminDataPanel>

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
                {!overviewResult.ok ? (
                  <UnconfirmedTableRow colSpan={4} />
                ) : recentContactMessages.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-8 text-center text-muted-foreground"
                      colSpan={4}
                    >
                      No contact requests yet.
                    </td>
                  </tr>
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
            {!overviewResult.ok ? (
              <UnconfirmedPanelMessage />
            ) : recentContactMessages.length === 0 ? (
              <p className="py-6 text-center text-muted-foreground">
                No contact requests yet.
              </p>
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
                    <h3 className="font-semibold text-base">
                      {message.subject}
                    </h3>
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
      </section>

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
              {overviewResult.ok ? (
                recentChats.map((chat) => (
                <tr
                  className="bg-card/70 transition hover:bg-muted/20"
                  key={chat.id}
                >
                  <td className="px-4 py-3">
                    <Link
                      className="line-clamp-1 cursor-pointer font-semibold text-primary hover:underline"
                      href={`/chat/${chat.id}?admin=1`}
                      title={`${chat.title || "Untitled chat"} • ${chat.id}`}
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
              ) : (
                <UnconfirmedTableRow colSpan={4} />
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 text-sm md:hidden">
          {overviewResult.ok ? (
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
          ) : (
            <UnconfirmedPanelMessage />
          )}
        </div>
      </AdminDataPanel>

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
              {overviewResult.ok ? (
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
              ) : (
                <UnconfirmedTableRow colSpan={4} />
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3 text-sm md:hidden">
          {overviewResult.ok ? (
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
          ) : (
            <UnconfirmedPanelMessage />
          )}
        </div>
      </AdminDataPanel>
    </div>
  );
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
        {confirmed ? value : "—"}
      </p>
      {description ? (
        <p className="text-muted-foreground text-xs">
          {confirmed ? description : "Unable to confirm from database"}
        </p>
      ) : null}
    </div>
  );
}
