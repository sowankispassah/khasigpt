import { Suspense } from "react";
import {
  grantUserCreditsAction,
  setUserActiveStateAction,
  setUserPersonalKnowledgePermissionAction,
  setUserRoleAction,
} from "@/app/(admin)/actions";
import { auth } from "@/app/(auth)/auth";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminUserActionsMenu } from "@/components/admin-user-actions-menu";
import { AdminUserCreditHistoryMenu } from "@/components/admin-user-credit-history-menu";
import {
  getUserBalanceSummaries,
  getUserCount,
  listActiveSubscriptionSummaries,
  listUsers,
  type UserBalanceSummary,
} from "@/lib/db/queries";
import type { UserRole } from "@/lib/db/schema";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";

const ADMIN_USERS_QUERY_TIMEOUT_MS = 10_000;
const USERS_PAGE_SIZE = 25;

const EMPTY_USER_BALANCE: UserBalanceSummary = {
  subscription: null,
  plan: null,
  tokensRemaining: 0,
  tokensTotal: 0,
  creditsRemaining: 0,
  creditsTotal: 0,
  allocatedCredits: 0,
  rechargedCredits: 0,
  expiresAt: null,
  startedAt: null,
};

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

  const withQueryFallback = async <T,>(promise: Promise<T>, fallback: T) => {
    try {
      return await withTimeout(promise, ADMIN_USERS_QUERY_TIMEOUT_MS);
    } catch {
      return fallback;
    }
  };

  const [users, totalUsers] = await Promise.all([
    withQueryFallback(
      listUsers({
        limit: USERS_PAGE_SIZE,
        offset,
      }),
      []
    ),
    withQueryFallback(getUserCount(), 0),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalUsers / USERS_PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const pageOffset = (page - 1) * USERS_PAGE_SIZE;
  const pagedUsers =
    pageOffset === offset
      ? users
      : await withQueryFallback(
          listUsers({
            limit: USERS_PAGE_SIZE,
            offset: pageOffset,
          }),
          []
        );

  const balanceByUserIdPromise = withQueryFallback(
    getUserBalanceSummaries(pagedUsers.map((user) => user.id)),
    new Map<string, UserBalanceSummary>()
  );
  const activeSubscriptionsPromise = withQueryFallback(
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
          {totalUsers.toLocaleString()} users
        </span>
      </header>

      <Suspense fallback={<UsersTableFallback />}>
        <UsersTableSection
          balanceByUserIdPromise={balanceByUserIdPromise}
          currentUserId={currentUserId}
          page={page}
          pagedUsers={pagedUsers}
          resolvedSearchParams={resolvedSearchParams}
          totalUsers={totalUsers}
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
}: {
  balanceByUserIdPromise: Promise<Map<string, UserBalanceSummary>>;
  currentUserId: string | undefined;
  page: number;
  pagedUsers: Awaited<ReturnType<typeof listUsers>>;
  resolvedSearchParams: Record<string, string | string[] | undefined> | undefined;
  totalUsers: number;
}) {
  const balanceByUserId = await balanceByUserIdPromise;

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
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
            {pagedUsers.length === 0 ? (
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
                        onSetRole={async (role) => {
                          "use server";
                          await setUserRoleAction({
                            userId: user.id,
                            role,
                          });
                        }}
                        onSuspend={async () => {
                          "use server";
                          await setUserActiveStateAction({
                            userId: user.id,
                            isActive: !user.isActive,
                          });
                        }}
                        onToggleRag={async () => {
                          "use server";
                          await setUserPersonalKnowledgePermissionAction({
                            userId: user.id,
                            allowed: !user.allowPersonalKnowledge,
                          });
                        }}
                        userId={user.id}
                      />
                      <AddCreditsForm
                        balance={balanceByUserId.get(user.id) ?? EMPTY_USER_BALANCE}
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
          totalItems={totalUsers}
        />
      </div>
    </div>
  );
}

async function ActiveSubscriptionsSection({
  activeSubscriptionsPromise,
}: {
  activeSubscriptionsPromise: Promise<
    Awaited<ReturnType<typeof listActiveSubscriptionSummaries>>
  >;
}) {
  const activeSubscriptions = await activeSubscriptionsPromise;

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
            {activeSubscriptions.length === 0 ? (
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

function AddCreditsForm({
  userId,
  balance,
}: {
  userId: string;
  balance: UserBalanceSummary;
}) {
  const creditsRemaining = balance.creditsRemaining;
  const creditsLabel = `${creditsRemaining.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} credits available`;

  return (
    <form
      action={grantUserCreditsAction}
      className="flex flex-nowrap items-center gap-2 whitespace-nowrap"
    >
      <input name="userId" type="hidden" value={userId} />
      <input name="billingCycleDays" type="hidden" value="90" />
      <div className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-muted-foreground text-xs">
        <span>{creditsLabel}</span>
        <AdminUserCreditHistoryMenu userId={userId} />
      </div>
      <input
        aria-label="Credits to grant"
        className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm"
        min={0}
        name="credits"
        placeholder="Credits"
        required
        step="0.5"
        type="number"
      />
      <ActionSubmitButton
        pendingLabel="Adding..."
        size="sm"
        successMessage="Credits granted"
        variant="secondary"
      >
        Add credits
      </ActionSubmitButton>
    </form>
  );
}
