import { Suspense } from "react";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  AdminStatusPill,
} from "@/components/admin/admin-ui";
import {
  AdminUsersBulkDeleteButton,
  AdminUsersSelectionProvider,
} from "@/components/admin-users-selection";
import {
  type AdminQueryResult,
  adminQueryResult,
} from "@/lib/admin/safe-query";
import { type AdminUserAccountStatusFilter, parseAdminUserAccountStatus } from "@/lib/admin/user-account-status";
import { TOKENS_PER_CREDIT } from "@/lib/constants";
import {
  type ActiveSubscriptionSummary,
  type AdminUserPresenceFilter,
  type AdminUserSortOption,
  type AdminUsersSnapshot,
  getAdminUsersSnapshot,
  getUserBalanceSummaries,
  isAdminUserPresenceFilter,
  isAdminUserSortOption,
  listActiveSubscriptionSummaries,
  type UserBalanceSummary,
} from "@/lib/db/queries";
import type { UserRole } from "@/lib/db/schema";
import { getAdminRequestSession } from "@/lib/security/admin-session";
import { AdminUserCreditsCell, AdminUserRow } from "./admin-user-row";
import { AdminUsersTable } from "./admin-users-table";
import { MarkUsersViewed } from "./mark-users-viewed";

export const dynamic = "force-dynamic";

const USERS_PAGE_SIZE = 25;

const EMPTY_ADMIN_USERS_SNAPSHOT: AdminUsersSnapshot = {
  totalUsers: 0,
  users: [],
};

function parsePage(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(rawValue ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseSearch(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const normalized = rawValue?.trim();
  return normalized ? normalized.slice(0, 120) : undefined;
}

function parseRole(value: string | string[] | undefined): UserRole | "all" {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return rawValue === "admin" || rawValue === "creator" || rawValue === "regular"
    ? rawValue
    : "all";
}

function parsePresence(
  value: string | string[] | undefined
): AdminUserPresenceFilter {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return isAdminUserPresenceFilter(rawValue) ? rawValue : "all";
}

function parseSort(value: string | string[] | undefined): AdminUserSortOption {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return isAdminUserSortOption(rawValue) ? rawValue : "created_desc";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getAdminRequestSession();
  const currentUserId = session?.user?.id;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedPage = parsePage(resolvedSearchParams?.page);
  const search = parseSearch(resolvedSearchParams?.q);
  const role = parseRole(resolvedSearchParams?.role);
  const accountStatus = parseAdminUserAccountStatus(Array.isArray(resolvedSearchParams?.active) ? resolvedSearchParams?.active[0] : resolvedSearchParams?.active);
  const presence = parsePresence(resolvedSearchParams?.presence);
  const sort = parseSort(resolvedSearchParams?.sort);
  const withQueryState = async <T,>(
    label: string,
    promise: Promise<T>,
    fallback: T
  ) =>
    adminQueryResult({
      fallback,
      label,
      promise,
    });

  const activeSubscriptionsStatePromise = withQueryState<
    ActiveSubscriptionSummary[]
  >(
    "users.active-subscriptions",
    listActiveSubscriptionSummaries({ limit: 20 }),
    []
  );

  const checkedThrough = new Date().toISOString();
  let usersSnapshotState = await withQueryState<AdminUsersSnapshot>(
    "users.snapshot",
    getAdminUsersSnapshot({
      limit: USERS_PAGE_SIZE,
      offset: (requestedPage - 1) * USERS_PAGE_SIZE,
      accountStatus,
      presence,
      role,
      search,
      sort,
    }),
    EMPTY_ADMIN_USERS_SNAPSHOT
  );

  let totalUsers = usersSnapshotState.data.totalUsers;
  const totalUsersConfirmed = usersSnapshotState.ok;
  const totalPages = totalUsersConfirmed
    ? Math.max(1, Math.ceil(totalUsers / USERS_PAGE_SIZE))
    : requestedPage;
  const page = totalUsersConfirmed ? Math.min(requestedPage, totalPages) : requestedPage;

  if (usersSnapshotState.ok && page !== requestedPage) {
    usersSnapshotState = await withQueryState<AdminUsersSnapshot>(
      "users.snapshot.clamped-page",
      getAdminUsersSnapshot({
        limit: USERS_PAGE_SIZE,
        offset: (page - 1) * USERS_PAGE_SIZE,
        accountStatus,
        presence,
        role,
        search,
        sort,
      }),
      EMPTY_ADMIN_USERS_SNAPSHOT
    );
    totalUsers = usersSnapshotState.data.totalUsers;
  }

  const pagedUsers = usersSnapshotState.data.users;
  const userListScope = [
    page,
    search ?? "",
    role,
    accountStatus,
    presence,
    sort,
  ].join(":");
  const balanceByUserIdStatePromise = usersSnapshotState.ok
    ? withQueryState<Map<string, UserBalanceSummary>>(
        "users.balances",
        getUserBalanceSummaries(pagedUsers.map((user) => user.id)),
        new Map<string, UserBalanceSummary>()
      )
    : Promise.resolve<AdminQueryResult<Map<string, UserBalanceSummary>>>({
        data: new Map<string, UserBalanceSummary>(),
        error: usersSnapshotState.error,
        ok: false,
      });

  return (
    <AdminUsersSelectionProvider
      currentUserId={currentUserId}
      initialUserIds={pagedUsers.map((user) => user.id)}
      key={userListScope}
      scopeKey={userListScope}
    >
      <div className="flex flex-col gap-6">
        {usersSnapshotState.ok && currentUserId ? (
          <MarkUsersViewed checkedThrough={checkedThrough} />
        ) : null}
        <AdminPageHeader
          actions={<AdminUsersBulkDeleteButton />}
          description="Search accounts, review activity and credits, and manage roles or access."
          meta={
            <AdminStatusPill>
              {totalUsersConfirmed
                ? `${totalUsers.toLocaleString()} users`
                : "User count unavailable"}
            </AdminStatusPill>
          }
          navHref="/admin/users"
          title="User management"
        />

        {!totalUsersConfirmed && (
          <AdminUsersQueryWarning message="User count could not be confirmed." />
        )}

        {!usersSnapshotState.ok && (
          <AdminUsersQueryWarning
            message="User list could not be confirmed."
          />
        )}

        <UsersTableSection
          balanceByUserIdStatePromise={balanceByUserIdStatePromise}
          currentUserId={currentUserId}
          page={page}
          pagedUsers={pagedUsers}
          accountStatus={accountStatus}
          presence={presence}
          role={role}
          search={search ?? ""}
          sort={sort}
          totalUsers={totalUsers}
          totalUsersConfirmed={totalUsersConfirmed}
          usersConfirmed={usersSnapshotState.ok}
        />

        <Suspense fallback={<SubscriptionsFallback />}>
          <ActiveSubscriptionsSection
            activeSubscriptionsStatePromise={activeSubscriptionsStatePromise}
          />
        </Suspense>
      </div>
    </AdminUsersSelectionProvider>
  );
}

function UsersTableSection({
  balanceByUserIdStatePromise,
  currentUserId,
  page,
  pagedUsers,
  accountStatus,
  presence,
  role,
  search,
  sort,
  totalUsers,
  totalUsersConfirmed,
  usersConfirmed,
}: {
  balanceByUserIdStatePromise: Promise<
    AdminQueryResult<Map<string, UserBalanceSummary>>
  >;
  currentUserId: string | undefined;
  page: number;
  pagedUsers: AdminUsersSnapshot["users"];
  accountStatus: AdminUserAccountStatusFilter;
  presence: AdminUserPresenceFilter;
  role: UserRole | "all";
  search: string;
  sort: AdminUserSortOption;
  totalUsers: number;
  totalUsersConfirmed: boolean;
  usersConfirmed: boolean;
}) {
  return (
    <AdminUsersTable
      currentUserId={currentUserId}
      key={`${page}:${search}:${role}:${accountStatus}:${presence}:${sort}`}
      initialPage={page}
      initialSearch={search}
      initialUserIds={pagedUsers.map((user) => user.id)}
      initialAccountStatus={accountStatus}
      initialPresence={presence}
      initialRole={role}
      initialSort={sort}
      notice={
        <Suspense fallback={null}>
          <BalanceQueryWarning
            balanceByUserIdStatePromise={balanceByUserIdStatePromise}
          />
        </Suspense>
      }
      pageSize={USERS_PAGE_SIZE}
      totalUsers={totalUsers}
      totalUsersConfirmed={totalUsersConfirmed}
    >
      {!usersConfirmed ? (
        <tr>
          <td colSpan={9}>
            <AdminEmptyState
              description="Refresh this admin section to retry."
              title="Unable to load users for this page"
            />
          </td>
        </tr>
      ) : pagedUsers.length === 0 ? (
        <tr>
          <td colSpan={9}>
            <AdminEmptyState
              description="Try a different search or clear the filters."
              title="No users found"
            />
          </td>
        </tr>
      ) : (
        pagedUsers.map((user) => (
          <AdminUserRow
            creditsSlot={
              <Suspense
                fallback={
                  <span className="inline-block h-4 w-14 animate-pulse rounded bg-muted" />
                }
              >
                <UserCreditsCell
                  balanceByUserIdStatePromise={balanceByUserIdStatePromise}
                  email={user.email}
                  userId={user.id}
                />
              </Suspense>
            }
            currentUserId={currentUserId}
            key={user.id}
            user={{ ...user, role: user.role as UserRole }}
          />
        ))
      )}
    </AdminUsersTable>
  );
}

async function BalanceQueryWarning({
  balanceByUserIdStatePromise,
}: {
  balanceByUserIdStatePromise: Promise<
    AdminQueryResult<Map<string, UserBalanceSummary>>
  >;
}) {
  const balanceByUserIdState = await balanceByUserIdStatePromise;
  return balanceByUserIdState.ok ? null : (
    <AdminUsersQueryWarning message="Credit balances could not be confirmed, so they show as “—” instead of zero." />
  );
}

async function UserCreditsCell({
  balanceByUserIdStatePromise,
  email,
  userId,
}: {
  balanceByUserIdStatePromise: Promise<
    AdminQueryResult<Map<string, UserBalanceSummary>>
  >;
  email: string;
  userId: string;
}) {
  const balanceByUserIdState = await balanceByUserIdStatePromise;
  return (
    <AdminUserCreditsCell
      creditsRemaining={
        balanceByUserIdState.ok
          ? (balanceByUserIdState.data.get(userId)?.creditsRemaining ?? 0)
          : null
      }
      email={email}
      userId={userId}
    />
  );
}

const subscriptionDateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function daysUntil(value: Date | string) {
  const expiresAt = new Date(value).getTime();
  return Math.ceil((expiresAt - Date.now()) / 86_400_000);
}

async function ActiveSubscriptionsSection({
  activeSubscriptionsStatePromise,
}: {
  activeSubscriptionsStatePromise: Promise<
    AdminQueryResult<ActiveSubscriptionSummary[]>
  >;
}) {
  const activeSubscriptionsState = await activeSubscriptionsStatePromise;
  const activeSubscriptions = activeSubscriptionsState.data;

  return (
    <AdminPanel
      description="Most recent users with an active plan and how much of it is left."
      title="Active subscriptions"
    >
      {!activeSubscriptionsState.ok ? (
        <div className="px-5 pt-4">
          <AdminUsersQueryWarning message="Active subscriptions could not be confirmed." />
        </div>
      ) : null}
      {!activeSubscriptionsState.ok ? null : activeSubscriptions.length === 0 ? (
        <AdminEmptyState title="No active subscriptions yet" />
      ) : (
        <ul className="divide-y divide-border/60">
          {activeSubscriptions.map((subscription) => {
            const allowance = Math.max(0, subscription.tokenAllowance);
            const balance = Math.max(0, subscription.tokenBalance);
            const percentLeft =
              allowance > 0 ? Math.min(100, (balance / allowance) * 100) : 0;
            const remainingDays = daysUntil(subscription.expiresAt);
            return (
              <li
                className="grid gap-3 px-5 py-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-center"
                key={subscription.subscriptionId}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-sm">
                    {subscription.userEmail}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {subscription.planName ?? "Plan removed"}
                  </div>
                </div>
                <div className="text-sm tabular-nums">
                  <span className="font-medium">
                    {(balance / TOKENS_PER_CREDIT).toLocaleString("en-IN", {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    of{" "}
                    {(allowance / TOKENS_PER_CREDIT).toLocaleString("en-IN", {
                      maximumFractionDigits: 2,
                    })}{" "}
                    credits
                  </span>
                </div>
                <div
                  aria-label={`${Math.round(percentLeft)}% of credits left`}
                  className="h-2 w-full rounded-full bg-muted"
                  role="img"
                >
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${percentLeft}%` }}
                  />
                </div>
                <div className="text-muted-foreground text-xs sm:text-right">
                  <AdminStatusPill tone={remainingDays <= 7 ? "warning" : "neutral"}>
                    {remainingDays <= 0
                      ? "Expires today"
                      : `${remainingDays} d left`}
                  </AdminStatusPill>
                  <div className="mt-1">
                    {subscriptionDateFormatter.format(new Date(subscription.expiresAt))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AdminPanel>
  );
}

function AdminUsersQueryWarning({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-800 text-sm dark:text-amber-300">
      {message} Refresh this admin section to retry.
    </div>
  );
}

function SubscriptionsFallback() {
  return (
    <AdminPanel title="Active subscriptions">
      <div aria-busy="true" className="space-y-3 p-5">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="h-10 animate-pulse rounded-lg bg-muted/50"
            key={`subscriptions-row-${index + 1}`}
          />
        ))}
      </div>
    </AdminPanel>
  );
}
