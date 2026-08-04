import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { AdminUserActionsMenu } from "@/components/admin-user-actions-menu";
import { EditableTranslation } from "@/components/translation-edit-provider";
import {
  type AdminQueryResult,
  adminQueryResult,
} from "@/lib/admin/safe-query";
import {
  type ActiveSubscriptionSummary,
  type AdminUsersSnapshot,
  getAdminUsersSnapshot,
  getUserBalanceSummaries,
  listActiveSubscriptionSummaries,
  type UserBalanceSummary,
} from "@/lib/db/queries";
import type { UserRole } from "@/lib/db/schema";
import { AddCreditsForm } from "./add-credits-form";
import { AdminUsersTable } from "./admin-users-table";

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

function formatAdminDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const currentUserId = session?.user?.id;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedPage = parsePage(resolvedSearchParams?.page);
  const search = parseSearch(resolvedSearchParams?.q);

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

  let usersSnapshotState = await withQueryState<AdminUsersSnapshot>(
    "users.snapshot",
    getAdminUsersSnapshot({
      limit: USERS_PAGE_SIZE,
      offset: (requestedPage - 1) * USERS_PAGE_SIZE,
      search,
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
        search,
      }),
      EMPTY_ADMIN_USERS_SNAPSHOT
    );
    totalUsers = usersSnapshotState.data.totalUsers;
  }

  const pagedUsers = usersSnapshotState.data.users;
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
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-xl">User management</h2>
          <p className="text-muted-foreground text-sm">
            Promote admins, suspend accounts, and monitor roles.
          </p>
        </div>
        <span className="rounded-full border bg-background px-3 py-1 font-medium text-xs text-muted-foreground">
          {totalUsersConfirmed
            ? `${totalUsers.toLocaleString()} users`
            : "User count unavailable"}
        </span>
      </header>

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
        search={search ?? ""}
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
  );
}

function UsersTableSection({
  balanceByUserIdStatePromise,
  currentUserId,
  page,
  pagedUsers,
  search,
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
  search: string;
  totalUsers: number;
  totalUsersConfirmed: boolean;
  usersConfirmed: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <Suspense fallback={null}>
        <BalanceQueryWarning
          balanceByUserIdStatePromise={balanceByUserIdStatePromise}
        />
      </Suspense>
      <AdminUsersTable
        currentUserId={currentUserId}
        key={`${page}:${search}`}
        initialPage={page}
        initialSearch={search}
        initialUserIds={pagedUsers.map((user) => user.id)}
        pageSize={USERS_PAGE_SIZE}
        totalUsers={totalUsers}
        totalUsersConfirmed={totalUsersConfirmed}
      >
        {!usersConfirmed ? (
          <tr>
            <td className="py-6 text-muted-foreground" colSpan={6}>
              Unable to load users for this page.
            </td>
          </tr>
        ) : pagedUsers.length === 0 ? (
          <tr>
            <td className="py-6 text-muted-foreground" colSpan={6}>
              No users found.
            </td>
          </tr>
        ) : (
          pagedUsers.map((user) => {
            const lastLoginAt = user.lastLoginAt;
            return (
              <tr className="border-t text-sm" key={user.id}>
                <td className="py-3">{user.email}</td>
                <td className="py-3 capitalize">{user.role}</td>
                <td className="py-3">
                  {user.isActive ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700 text-xs">
                      <EditableTranslation
                        defaultText="Active"
                        description="Status badge for an active admin user account."
                        translationKey="admin.users.status.active"
                      />
                    </span>
                  ) : (
                    <span className="rounded-full bg-rose-100 px-2 py-1 text-rose-700 text-xs">
                      <EditableTranslation
                        defaultText="Suspended"
                        description="Status badge for a suspended admin user account."
                        translationKey="admin.users.status.suspended"
                      />
                    </span>
                  )}
                </td>
                <td className="py-3">
                  <time dateTime={user.createdAt.toISOString()}>
                    {formatAdminDateTime(user.createdAt)}
                  </time>
                </td>
                <td className="py-3">
                  {lastLoginAt ? (
                    <time dateTime={lastLoginAt.toISOString()}>
                      {formatAdminDateTime(lastLoginAt)}
                    </time>
                  ) : (
                    <EditableTranslation
                      defaultText="Never"
                      description="Shown when a user has no recorded successful login."
                      translationKey="admin.users.last_login.never"
                    />
                  )}
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pr-2">
                    <AdminUserActionsMenu
                      allowPersonalKnowledge={Boolean(
                        user.allowPersonalKnowledge
                      )}
                      currentRole={user.role as UserRole}
                      email={user.email}
                      isActive={user.isActive}
                      isSelf={user.id === currentUserId}
                      userId={user.id}
                    />
                    <Suspense
                      fallback={
                        <AddCreditsForm
                          creditsRemaining={null}
                          userId={user.id}
                        />
                      }
                    >
                      <UserCreditAction
                        balanceByUserIdStatePromise={
                          balanceByUserIdStatePromise
                        }
                        userId={user.id}
                      />
                    </Suspense>
                  </div>
                </td>
              </tr>
            );
          })
        )}
      </AdminUsersTable>
    </div>
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
    <AdminUsersQueryWarning message="Credit balances could not be confirmed. User rows remain available and credit balances stay unconfirmed instead of falling back to zero." />
  );
}

async function UserCreditAction({
  balanceByUserIdStatePromise,
  userId,
}: {
  balanceByUserIdStatePromise: Promise<
    AdminQueryResult<Map<string, UserBalanceSummary>>
  >;
  userId: string;
}) {
  const balanceByUserIdState = await balanceByUserIdStatePromise;
  return (
    <AddCreditsForm
      creditsRemaining={
        balanceByUserIdState.ok
          ? (balanceByUserIdState.data.get(userId)?.creditsRemaining ?? 0)
          : null
      }
      userId={userId}
    />
  );
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
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-base">Active subscriptions</h3>
          <p className="text-muted-foreground text-sm">
            Recent users with active plans and their remaining balances.
          </p>
        </div>
      </div>
      {!activeSubscriptionsState.ok && (
        <AdminUsersQueryWarning message="Active subscriptions could not be confirmed. Existing rows are hidden until this section loads real data." />
      )}
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-muted-foreground text-xs uppercase">
            <tr>
              <th className="py-2 text-left">User</th>
              <th className="py-2 text-left">Plan</th>
              <th className="py-2 text-right">Tokens left</th>
              <th className="py-2 text-right">Expires</th>
            </tr>
          </thead>
          <tbody>
            {!activeSubscriptionsState.ok ? (
              <tr>
                <td className="py-4 text-muted-foreground" colSpan={4}>
                  Unable to load active subscriptions.
                </td>
              </tr>
            ) : activeSubscriptions.length === 0 ? (
              <tr>
                <td className="py-4 text-muted-foreground" colSpan={4}>
                  No active subscriptions yet.
                </td>
              </tr>
            ) : (
              activeSubscriptions.map((subscription) => (
                <tr className="border-t" key={subscription.subscriptionId}>
                  <td className="py-2 font-mono text-xs">
                    {subscription.userEmail}
                  </td>
                  <td className="py-2">
                    {subscription.planName ?? "Plan removed"}
                  </td>
                  <td className="py-2 text-right">
                    {subscription.tokenBalance.toLocaleString()} /{" "}
                    {subscription.tokenAllowance.toLocaleString()}
                  </td>
                  <td className="py-2 text-right">
                    {new Date(subscription.expiresAt).toLocaleDateString(
                      "en-IN",
                      {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      }
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminUsersQueryWarning({ message }: { message: string }) {
  return (
    <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-sm">
      {message} Refresh this admin section to retry.
    </div>
  );
}

function SubscriptionsFallback() {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            className="h-10 animate-pulse rounded-lg bg-muted/50"
            key={`subscriptions-row-${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
