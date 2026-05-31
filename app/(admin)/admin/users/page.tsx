import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminUserActionsMenu } from "@/components/admin-user-actions-menu";
import {
  type AdminQueryResult,
  adminQueryResult,
} from "@/lib/admin/safe-query";
import {
  getUserBalanceSummaries,
  getUserCount,
  listActiveSubscriptionSummaries,
  listUsers,
  type UserBalanceSummary,
} from "@/lib/db/queries";
import type { UserRole } from "@/lib/db/schema";
import { AddCreditsForm } from "./add-credits-form";

export const dynamic = "force-dynamic";

const ADMIN_USERS_QUERY_TIMEOUT_MS = 5000;
const USERS_PAGE_SIZE = 25;

function parsePage(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(rawValue ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
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
  const offset = (requestedPage - 1) * USERS_PAGE_SIZE;

  const withQueryState = async <T,>(
    label: string,
    promise: Promise<T>,
    fallback: T
  ) =>
    adminQueryResult({
      fallback,
      label,
      promise,
      timeoutMs: ADMIN_USERS_QUERY_TIMEOUT_MS,
    });

  const [usersState, totalUsersState] = await Promise.all([
    withQueryState(
      "users.list",
      listUsers({
        limit: USERS_PAGE_SIZE,
        offset,
      }),
      []
    ),
    withQueryState("users.count", getUserCount(), 0),
  ]);

  const totalUsers = totalUsersState.data;
  const totalPages = totalUsersState.ok
    ? Math.max(1, Math.ceil(totalUsers / USERS_PAGE_SIZE))
    : requestedPage;
  const page = totalUsersState.ok
    ? Math.min(requestedPage, totalPages)
    : requestedPage;
  const pageOffset = (page - 1) * USERS_PAGE_SIZE;
  const pagedUsersState =
    pageOffset === offset || !usersState.ok
      ? usersState
      : await withQueryState(
          "users.corrected-page",
          listUsers({
            limit: USERS_PAGE_SIZE,
            offset: pageOffset,
          }),
          []
        );
  const pagedUsers = pagedUsersState.data;

  const balanceByUserIdPromise = withQueryState(
    "users.balance-summaries",
    getUserBalanceSummaries(pagedUsers.map((user) => user.id)),
    new Map<string, UserBalanceSummary>()
  );
  const activeSubscriptionsPromise = withQueryState(
    "users.active-subscriptions",
    listActiveSubscriptionSummaries({ limit: 20 }),
    []
  );

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
          {totalUsersState.ok
            ? `${totalUsers.toLocaleString()} users`
            : "User count unavailable"}
        </span>
      </header>

      {(!usersState.ok || !totalUsersState.ok) && (
        <AdminUsersQueryWarning
          message={[
            !usersState.ok ? "User list could not be confirmed." : null,
            !pagedUsersState.ok && pagedUsersState !== usersState
              ? "This page could not be confirmed."
              : null,
            !totalUsersState.ok ? "User count could not be confirmed." : null,
          ]
            .filter(Boolean)
            .join(" ")}
        />
      )}

      <Suspense fallback={<UsersTableFallback />}>
        <UsersTableSection
          balanceByUserIdPromise={balanceByUserIdPromise}
          currentUserId={currentUserId}
          page={page}
          pagedUsers={pagedUsers}
          resolvedSearchParams={resolvedSearchParams}
          totalUsers={totalUsers}
          totalUsersConfirmed={totalUsersState.ok}
          usersConfirmed={pagedUsersState.ok}
        />
      </Suspense>

      <Suspense fallback={<SubscriptionsFallback />}>
        <ActiveSubscriptionsSection
          activeSubscriptionsPromise={activeSubscriptionsPromise}
        />
      </Suspense>
    </div>
  );
}

async function UsersTableSection({
  balanceByUserIdPromise,
  currentUserId,
  page,
  pagedUsers,
  resolvedSearchParams,
  totalUsers,
  totalUsersConfirmed,
  usersConfirmed,
}: {
  balanceByUserIdPromise: Promise<
    AdminQueryResult<Map<string, UserBalanceSummary>>
  >;
  currentUserId: string | undefined;
  page: number;
  pagedUsers: Awaited<ReturnType<typeof listUsers>>;
  resolvedSearchParams: Record<string, string | string[] | undefined> | undefined;
  totalUsers: number;
  totalUsersConfirmed: boolean;
  usersConfirmed: boolean;
}) {
  const balanceByUserIdState = await balanceByUserIdPromise;
  const balanceByUserId = balanceByUserIdState.data;

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      {!balanceByUserIdState.ok && (
        <AdminUsersQueryWarning message="Credit balances could not be confirmed. Rows keep credit actions available, but balances are shown as unavailable instead of zero." />
      )}
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="text-muted-foreground text-xs uppercase">
            <tr>
              <th className="py-3 text-left">Email</th>
              <th className="py-3 text-left">Role</th>
              <th className="py-3 text-left">Status</th>
              <th className="py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!usersConfirmed ? (
              <tr>
                <td className="py-6 text-muted-foreground" colSpan={4}>
                  Unable to load users for this page.
                </td>
              </tr>
            ) : pagedUsers.length === 0 ? (
              <tr>
                <td className="py-6 text-muted-foreground" colSpan={4}>
                  No users found.
                </td>
              </tr>
            ) : (
              pagedUsers.map((user) => (
                <tr className="border-t text-sm" key={user.id}>
                  <td className="py-3">{user.email}</td>
                  <td className="py-3 capitalize">{user.role}</td>
                  <td className="py-3">
                    {user.isActive ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700 text-xs">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-rose-100 px-2 py-1 text-rose-700 text-xs">
                        Suspended
                      </span>
                    )}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pr-2">
                      <AdminUserActionsMenu
                        allowPersonalKnowledge={Boolean(
                          user.allowPersonalKnowledge
                        )}
                        currentRole={user.role as UserRole}
                        isActive={user.isActive}
                        isSelf={user.id === currentUserId}
                        userId={user.id}
                      />
                      <AddCreditsForm
                        creditsRemaining={
                          balanceByUserIdState.ok
                            ? balanceByUserId.get(user.id)?.creditsRemaining ?? 0
                            : null
                        }
                        userId={user.id}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <AdminPagination
          itemLabel="users"
          page={page}
          pageSize={USERS_PAGE_SIZE}
          pathname="/admin/users"
          searchParams={resolvedSearchParams}
          totalItems={totalUsersConfirmed ? totalUsers : pagedUsers.length}
        />
      </div>
    </div>
  );
}

async function ActiveSubscriptionsSection({
  activeSubscriptionsPromise,
}: {
  activeSubscriptionsPromise: Promise<
    AdminQueryResult<Awaited<ReturnType<typeof listActiveSubscriptionSummaries>>>
  >;
}) {
  const activeSubscriptionsState = await activeSubscriptionsPromise;
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

function UsersTableFallback() {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="space-y-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            className="h-12 animate-pulse rounded-lg bg-muted/50"
            key={`users-row-${index + 1}`}
          />
        ))}
      </div>
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
