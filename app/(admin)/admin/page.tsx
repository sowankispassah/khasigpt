import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

import {
  getChatCount,
  getContactMessageCount,
  getUserCount,
  listAuditLog,
  listChats,
  listContactMessages,
  listUsers,
} from "@/lib/db/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  let userCount = 0;
  let chatCount = 0;
  let contactMessageCount = 0;
  let recentUsers: Awaited<ReturnType<typeof listUsers>> = [];
  let recentChats: Awaited<ReturnType<typeof listChats>> = [];
  let recentAudits: Awaited<ReturnType<typeof listAuditLog>> = [];
  let recentContactMessages: Awaited<
    ReturnType<typeof listContactMessages>
  > = [];

  try {
    [
      userCount,
      chatCount,
      recentUsers,
      recentChats,
      recentAudits,
      contactMessageCount,
      recentContactMessages,
    ] = await Promise.all([
      getUserCount(),
      getChatCount(),
      listUsers({ limit: 5 }),
      listChats({ limit: 5 }),
      listAuditLog({ limit: 5 }),
      getContactMessageCount(),
      listContactMessages({ limit: 5 }),
    ]);
  } catch (error) {
    console.error("Failed to load admin overview data", error);
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total users" value={userCount} />
        <MetricCard label="Total chats" value={chatCount} />
        <MetricCard
          label="Recent users"
          value={recentUsers.length}
          description="Last 5 accounts"
        />
        <MetricCard
          label="Audit events"
          value={recentAudits.length}
          description="Last 5 records"
        />
        <MetricCard
          label="Contact requests"
          value={contactMessageCount}
          description="Total messages received"
        />
      </section>

      <section className="grid items-stretch gap-8 xl:grid-cols-2">
        <DataPanel title="Newest users">
          <table className="min-w-[640px] w-full table-fixed text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-sm">
              {recentUsers.map((user) => (
                <tr key={user.id} className="bg-card/70 transition hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <span className="block truncate font-medium">{user.email}</span>
                  </td>
                  <td className="px-4 py-3 capitalize">{user.role}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-semibold",
                        user.isActive
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      )}
                    >
                      {user.isActive ? "Active" : "Suspended"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataPanel>

        <DataPanel title="Latest contact requests">
          <table className="min-w-[680px] w-full table-fixed text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Subject</th>
                <th className="px-4 py-3 text-left font-medium">From</th>
                <th className="px-4 py-3 text-left font-medium">Phone</th>
                <th className="px-4 py-3 text-left font-medium">Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-sm">
              {recentContactMessages.length === 0 ? (
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
                  <tr key={message.id} className="bg-card/70 transition hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{message.subject}</div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {message.message}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{message.name}</div>
                      <span className="text-xs text-muted-foreground">
                        {message.email}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {message.phone ? message.phone : "N/A"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(message.createdAt), {
                        addSuffix: true,
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DataPanel>
      </section>

      <DataPanel title="Latest chats">
        <table className="min-w-[720px] w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Chat</th>
              <th className="px-4 py-3 text-left font-medium">Owner</th>
              <th className="px-4 py-3 text-left font-medium">Visibility</th>
              <th className="px-4 py-3 text-left font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 text-sm">
            {recentChats.map((chat) => (
              <tr key={chat.id} className="bg-card/70 transition hover:bg-muted/20">
                <td className="px-4 py-3">
                  <Link
                    className="line-clamp-1 font-semibold text-primary hover:underline"
                    href={`/chat/${chat.id}?admin=1`}
                    title={`${chat.title || "Untitled chat"} • ${chat.id}`}
                  >
                    {chat.title || "Untitled chat"}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className="block truncate" title={chat.userEmail ?? chat.userId}>
                    {chat.userEmail ?? chat.userId}
                  </span>
                </td>
                <td className="px-4 py-3 capitalize">
                  <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                    {chat.visibility}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(chat.createdAt), { addSuffix: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataPanel>

      <DataPanel title="Recent audit activity">
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
            {recentAudits.map((entry) => (
              <tr key={entry.id} className="border-t text-sm">
                <td className="py-2 font-medium">{entry.action}</td>
                <td className="py-2">{entry.actorId}</td>
                <td className="py-2 text-xs text-muted-foreground">
                  {JSON.stringify(entry.target)}
                </td>
                <td className="py-2 text-muted-foreground">
                  {formatDistanceToNow(new Date(entry.createdAt), {
                    addSuffix: true,
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DataPanel>
    </div>
  );
}

function MetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-muted-foreground text-xs uppercase">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {description ? (
        <p className="text-muted-foreground text-xs">{description}</p>
      ) : null}
    </div>
  );
}

function DataPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex h-full flex-col rounded-xl border bg-card/80 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
      </div>
      <div className="relative mt-4 grow overflow-hidden">
        <div className="h-full overflow-auto rounded-lg border border-border/60 bg-background/60">
          {children}
        </div>
      </div>
    </section>
  );
}



