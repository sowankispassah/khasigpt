import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

import {
  getChatCount,
  getUserCount,
  listAuditLog,
  listChats,
  listUsers,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  let userCount = 0;
  let chatCount = 0;
  let recentUsers: Awaited<ReturnType<typeof listUsers>> = [];
  let recentChats: Awaited<ReturnType<typeof listChats>> = [];
  let recentAudits: Awaited<ReturnType<typeof listAuditLog>> = [];

  try {
    [
      userCount,
      chatCount,
      recentUsers,
      recentChats,
      recentAudits,
    ] = await Promise.all([
      getUserCount(),
      getChatCount(),
      listUsers({ limit: 5 }),
      listChats({ limit: 5 }),
      listAuditLog({ limit: 5 }),
    ]);
  } catch (error) {
    console.error("Failed to load admin overview data", error);
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <DataPanel title="Newest users">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase">
              <tr>
                <th className="py-2 text-left">Email</th>
                <th className="py-2 text-left">Role</th>
                <th className="py-2 text-left">Status</th>
                <th className="py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {recentUsers.map((user) => (
                <tr key={user.id} className="border-t text-sm">
                  <td className="py-2">{user.email}</td>
                  <td className="py-2 capitalize">{user.role}</td>
                  <td className="py-2">{user.isActive ? "Active" : "Suspended"}</td>
                  <td className="py-2 text-muted-foreground">
                    {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataPanel>

        <DataPanel title="Latest chats">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase">
              <tr>
                <th className="py-2 text-left">Chat</th>
                <th className="py-2 text-left">Owner</th>
                <th className="py-2 text-left">Visibility</th>
                <th className="py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {recentChats.map((chat) => (
                <tr key={chat.id} className="border-t text-sm">
                  <td className="py-2">
                    <div className="flex flex-col">
                      <Link
                        className="text-sm font-medium text-primary hover:underline"
                        href={`/chat/${chat.id}?admin=1`}
                      >
                        {chat.title || "Untitled chat"}
                      </Link>
                      <span className="font-mono text-xs text-muted-foreground">{chat.id}</span>
                    </div>
                  </td>
                  <td className="py-2">{chat.userEmail ?? chat.userId}</td>
                  <td className="py-2 capitalize">{chat.visibility}</td>
                  <td className="py-2 text-muted-foreground">
                    {formatDistanceToNow(new Date(chat.createdAt), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataPanel>
      </section>

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
    <section className="rounded-lg border bg-card p-4 shadow-sm">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-4 overflow-x-auto">{children}</div>
    </section>
  );
}
