import { formatDistanceToNow } from "date-fns";
import {
  CircleDollarSign,
  Contact,
  MessagesSquare,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import {
  AdminTrendChartDeferred,
  AdminTrendChartSkeleton,
} from "@/components/admin/admin-trend-chart-deferred";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminStatCard,
  AdminStatusPill,
} from "@/components/admin/admin-ui";
import { AdminLiveActivityPanelDeferred } from "@/components/admin-live-activity-panel-deferred";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import {
  type AdminDashboardTrends,
  getAdminDashboardTrends,
} from "@/lib/admin/dashboard-trends";
import {
  type AdminQueryResult,
  adminQueryResult,
} from "@/lib/admin/safe-query";
import {
  type AdminOverviewAudit,
  type AdminOverviewSnapshot,
  getAdminOverviewSnapshot,
} from "@/lib/db/queries";

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

type OverviewResult = AdminQueryResult<AdminOverviewSnapshot>;
type TrendsResult = AdminQueryResult<AdminDashboardTrends | null>;

const integerFormatter = new Intl.NumberFormat("en-IN");
const rupeeFormatter = new Intl.NumberFormat("en-IN", {
  currency: "INR",
  maximumFractionDigits: 0,
  style: "currency",
});

function T({
  description,
  id,
  text,
}: {
  description: string;
  id: string;
  text: string;
}) {
  return (
    <EditableTranslation
      defaultText={text}
      description={description}
      translationKey={`admin.dashboard.${id}`}
    />
  );
}

function ago(value: Date | string) {
  return formatDistanceToNow(new Date(value), { addSuffix: true });
}

export default async function AdminOverviewPage() {
  // Trends are optional: start them now and stream them in after the snapshot.
  const trendsPromise = adminQueryResult<AdminDashboardTrends | null>({
    fallback: null,
    label: "overview.trends",
    promise: getAdminDashboardTrends(),
  });
  const overviewResult = await adminQueryResult({
    fallback: EMPTY_ADMIN_OVERVIEW_SNAPSHOT,
    label: "overview.snapshot",
    promise: getAdminOverviewSnapshot(),
  });

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        actions={
          <>
            <Button asChild className="cursor-pointer" size="sm" variant="outline">
              <Link href="/admin/users">
                <Users className="size-4" />
                <T description="Dashboard quick action that opens user management." id="action.users" text="Manage users" />
              </Link>
            </Button>
            <Button asChild className="cursor-pointer" size="sm" variant="outline">
              <Link href="/admin/settings">
                <Settings className="size-4" />
                <T description="Dashboard quick action that opens admin settings." id="action.settings" text="Settings" />
              </Link>
            </Button>
          </>
        }
        description={
          <T description="Admin dashboard subtitle." id="subtitle" text="Growth, usage and recent activity across KhasiGPT." />
        }
        navHref="/admin"
        title={<T description="Admin dashboard page title." id="title" text="Overview" />}
      />

      {overviewResult.ok ? null : (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-800 text-sm dark:text-amber-300">
          <p className="font-medium">
            <T description="Dashboard warning title when the overview query fails." id="degraded.title" text="Overview data could not be fully confirmed." />
          </p>
          <p className="mt-0.5">
            <T description="Dashboard warning body when the overview query fails." id="degraded.body" text="Unavailable metrics are shown as dashes, never as zero. Other panels load independently." />
          </p>
        </div>
      )}

      <Suspense fallback={<KpiGrid overviewResult={overviewResult} trends={null} />}>
        <KpiGridWithTrends overviewResult={overviewResult} trendsPromise={trendsPromise} />
      </Suspense>

      <div className="grid gap-6 xl:grid-cols-3">
        <AdminPanel
          className="xl:col-span-2"
          description={<T description="Dashboard activity chart subtitle." id="activity.subtitle" text="Daily totals in India time." />}
          title={<T description="Dashboard activity chart title." id="activity.title" text="Activity" />}
        >
          <Suspense fallback={<AdminTrendChartSkeleton />}>
            <TrendSection trendsPromise={trendsPromise} />
          </Suspense>
        </AdminPanel>
        <NewestUsersPanel overviewResult={overviewResult} />
      </div>

      <AdminLiveActivityPanelDeferred />

      <div className="grid gap-6 xl:grid-cols-3">
        <LatestChatsPanel overviewResult={overviewResult} />
        <LatestContactsPanel overviewResult={overviewResult} />
      </div>

      <RecentAuditPanel overviewResult={overviewResult} />
    </div>
  );
}

async function KpiGridWithTrends({
  overviewResult,
  trendsPromise,
}: {
  overviewResult: OverviewResult;
  trendsPromise: Promise<TrendsResult>;
}) {
  const trendsResult = await trendsPromise;
  return (
    <KpiGrid
      overviewResult={overviewResult}
      trends={trendsResult.ok ? trendsResult.data : null}
    />
  );
}

function KpiGrid({
  overviewResult,
  trends,
}: {
  overviewResult: OverviewResult;
  trends: AdminDashboardTrends | null;
}) {
  const snapshot = overviewResult.ok ? overviewResult.data : null;
  const thisWeek = <T description="Suffix for the dashboard 'new in the last 7 days' chip." id="kpi.this_week" text="this week" />;

  return (
    <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <AdminStatCard
        hint={<T description="Dashboard total users card hint." id="kpi.users.hint" text="All registered accounts" />}
        href="/admin/users"
        icon={Users}
        label={<T description="Dashboard total users card label." id="kpi.users" text="Total users" />}
        trend={trends ? { label: thisWeek, value: trends.totals.signupsLast7 } : null}
        value={snapshot ? integerFormatter.format(snapshot.userCount) : null}
      />
      <AdminStatCard
        hint={<T description="Dashboard total chats card hint." id="kpi.chats.hint" text="Active conversations" />}
        href="/admin/chats"
        icon={MessagesSquare}
        label={<T description="Dashboard total chats card label." id="kpi.chats" text="Total chats" />}
        trend={trends ? { label: thisWeek, value: trends.totals.chatsLast7 } : null}
        value={snapshot ? integerFormatter.format(snapshot.chatCount) : null}
      />
      <AdminStatCard
        hint={<T description="Dashboard revenue card hint." id="kpi.revenue.hint" text="Paid INR orders, last 30 days" />}
        href="/admin/account"
        icon={CircleDollarSign}
        label={<T description="Dashboard revenue card label." id="kpi.revenue" text="Revenue" />}
        value={trends ? rupeeFormatter.format(trends.totals.revenueLast30) : null}
      />
      <AdminStatCard
        hint={<T description="Dashboard contact requests card hint." id="kpi.contacts.hint" text="Messages received" />}
        href="/admin/contacts"
        icon={Contact}
        label={<T description="Dashboard contact requests card label." id="kpi.contacts" text="Contact requests" />}
        value={snapshot ? integerFormatter.format(snapshot.contactMessageCount) : null}
      />
    </section>
  );
}

async function TrendSection({
  trendsPromise,
}: {
  trendsPromise: Promise<TrendsResult>;
}) {
  const trendsResult = await trendsPromise;
  if (!(trendsResult.ok && trendsResult.data)) {
    return (
      <AdminEmptyState
        description={<T description="Dashboard activity chart unavailable description." id="activity.unavailable.body" text="Trend data could not be loaded. Refresh to try again." />}
        title={<T description="Dashboard activity chart unavailable title." id="activity.unavailable.title" text="Activity unavailable" />}
      />
    );
  }
  return <AdminTrendChartDeferred points={trendsResult.data.points} />;
}

function UnconfirmedState() {
  return (
    <AdminEmptyState
      title={<T description="Shown in a dashboard panel when its data could not be confirmed." id="unconfirmed" text="Unable to confirm this data right now." />}
    />
  );
}

function ViewAllLink({ href }: { href: string }) {
  return (
    <Button asChild className="cursor-pointer" size="sm" variant="ghost">
      <Link href={href}>
        <T description="Dashboard panel link to the full list." id="view_all" text="View all" />
      </Link>
    </Button>
  );
}

function NewestUsersPanel({ overviewResult }: { overviewResult: OverviewResult }) {
  const users = overviewResult.data.recentUsers;
  return (
    <AdminPanel
      action={<ViewAllLink href="/admin/users" />}
      title={<T description="Dashboard newest users panel title." id="users.title" text="Newest users" />}
    >
      {!overviewResult.ok ? (
        <UnconfirmedState />
      ) : users.length === 0 ? (
        <AdminEmptyState icon={Users} title={<T description="Dashboard newest users empty state." id="users.empty" text="No users yet." />} />
      ) : (
        <ul className="divide-y">
          {users.map((user) => (
            <li className="flex items-center gap-3 px-5 py-3" key={user.id}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground text-xs uppercase">
                {user.email.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  className="block cursor-pointer truncate font-medium text-sm hover:underline"
                  href={`/admin/users?q=${encodeURIComponent(user.email)}`}
                  title={user.email}
                >
                  {user.email}
                </Link>
                <p className="text-muted-foreground text-xs">{ago(user.createdAt)}</p>
              </div>
              <AdminStatusPill tone={user.isActive ? "success" : "warning"}>
                {user.isActive ? (
                  <T description="Active account status pill." id="status.active" text="Active" />
                ) : (
                  <T description="Suspended account status pill." id="status.suspended" text="Suspended" />
                )}
              </AdminStatusPill>
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}

function LatestChatsPanel({ overviewResult }: { overviewResult: OverviewResult }) {
  const chats = overviewResult.data.recentChats;
  return (
    <AdminPanel
      action={<ViewAllLink href="/admin/chats" />}
      className="xl:col-span-2"
      title={<T description="Dashboard latest chats panel title." id="chats.title" text="Latest chats" />}
    >
      {!overviewResult.ok ? (
        <UnconfirmedState />
      ) : chats.length === 0 ? (
        <AdminEmptyState icon={MessagesSquare} title={<T description="Dashboard latest chats empty state." id="chats.empty" text="No chats yet." />} />
      ) : (
        <ul className="divide-y">
          {chats.map((chat) => (
            <li className="flex items-center gap-3 px-5 py-3" key={chat.id}>
              <div className="min-w-0 flex-1">
                <Link
                  className="block cursor-pointer truncate font-medium text-sm hover:underline"
                  href={`/chat/${chat.id}?admin=1`}
                  title={chat.title || chat.id}
                >
                  {chat.title || (
                    <T description="Fallback title for a chat without one on the dashboard." id="chats.untitled" text="Untitled chat" />
                  )}
                </Link>
                <p className="truncate text-muted-foreground text-xs" title={chat.userEmail ?? chat.userId}>
                  {chat.userEmail ?? chat.userId}
                </p>
              </div>
              <AdminStatusPill className="capitalize">{chat.visibility}</AdminStatusPill>
              <span className="hidden w-28 shrink-0 text-right text-muted-foreground text-xs sm:block">
                {ago(chat.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}

function LatestContactsPanel({ overviewResult }: { overviewResult: OverviewResult }) {
  const messages = overviewResult.data.recentContactMessages;
  return (
    <AdminPanel
      action={<ViewAllLink href="/admin/contacts" />}
      title={<T description="Dashboard latest contact requests panel title." id="contacts.title" text="Contact requests" />}
    >
      {!overviewResult.ok ? (
        <UnconfirmedState />
      ) : messages.length === 0 ? (
        <AdminEmptyState icon={Contact} title={<T description="Dashboard contact requests empty state." id="contacts.empty" text="No contact requests yet." />} />
      ) : (
        <ul className="divide-y">
          {messages.map((message) => (
            <li className="px-5 py-3" key={message.id}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate font-medium text-sm">{message.subject}</p>
                <span className="shrink-0 text-muted-foreground text-xs">{ago(message.createdAt)}</span>
              </div>
              <p className="truncate text-muted-foreground text-xs">
                {message.name} · {message.email}
              </p>
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}

const AUDIT_TARGET_KEYS = ["email", "userId", "chatId", "orderId", "key", "setting", "document"];

/** One readable detail from an audit target instead of raw JSON. */
function describeAuditTarget(target: AdminOverviewAudit["target"]) {
  if (!target || typeof target !== "object") {
    return null;
  }
  const record = target as Record<string, unknown>;
  for (const key of AUDIT_TARGET_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  const first = Object.entries(record).find(([, value]) => typeof value === "string" || typeof value === "number");
  return first ? `${first[0]}: ${String(first[1])}` : null;
}

function RecentAuditPanel({ overviewResult }: { overviewResult: OverviewResult }) {
  const audits = overviewResult.data.recentAudits;
  return (
    <AdminPanel
      action={<ViewAllLink href="/admin/logs" />}
      title={<T description="Dashboard recent audit activity panel title." id="audit.title" text="Recent audit activity" />}
    >
      {!overviewResult.ok ? (
        <UnconfirmedState />
      ) : audits.length === 0 ? (
        <AdminEmptyState title={<T description="Dashboard audit activity empty state." id="audit.empty" text="No audit events yet." />} />
      ) : (
        <ul className="divide-y">
          {audits.map((entry) => {
            const detail = describeAuditTarget(entry.target);
            return (
              <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3" key={entry.id}>
                <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">{entry.action}</code>
                <span className="min-w-0 flex-1 truncate text-sm" title={detail ?? undefined}>
                  {detail ?? <span className="text-muted-foreground">—</span>}
                </span>
                <span className="hidden font-mono text-muted-foreground text-xs md:inline" title={entry.actorId}>
                  {entry.actorId.slice(0, 8)}
                </span>
                <span className="w-28 shrink-0 text-right text-muted-foreground text-xs">{ago(entry.createdAt)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </AdminPanel>
  );
}
