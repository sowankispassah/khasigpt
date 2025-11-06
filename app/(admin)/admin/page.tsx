import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { loadAdminOverviewSnapshot } from "./overview-data";

export default async function AdminOverviewPage() {
  const {
    userCount,
    chatCount,
    contactMessageCount,
    recentUsers,
    recentChats,
    recentAudits,
    recentContactMessages,
  } = await loadAdminOverviewSnapshot();

  return (
    <div className="flex flex-col gap-10">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total users" value={userCount} />
        <MetricCard label="Total chats" value={chatCount} />
        <MetricCard
          description="Last 5 accounts"
          label="Recent users"
          value={recentUsers.length}
        />
        <MetricCard
          description="Last 5 records"
          label="Audit events"
          value={recentAudits.length}
        />
        <MetricCard
          description="Total messages received"
          label="Contact requests"
          value={contactMessageCount}
        />
      </section>

      <section className="grid items-stretch gap-8 xl:grid-cols-2">
        <DataPanel title="Newest users">
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
              {recentUsers.map((user) => (
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
              ))}
            </tbody>
          </table>
        </DataPanel>

        <DataPanel title="Latest contact requests">
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
        </DataPanel>
      </section>

      <DataPanel title="Latest chats">
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
            {recentChats.map((chat) => (
              <tr
                className="bg-card/70 transition hover:bg-muted/20"
                key={chat.id}
              >
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
      <p className="mt-2 font-semibold text-2xl">{value}</p>
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
        <h2 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
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
