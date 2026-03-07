import {
  grantUserCreditsAction,
  setUserActiveStateAction,
  setUserPersonalKnowledgePermissionAction,
  setUserRoleAction,
} from "@/app/(admin)/actions";
import { auth } from "@/app/(auth)/auth";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { AdminUserActionsMenu } from "@/components/admin-user-actions-menu";
import { AdminUserCreditHistoryMenu } from "@/components/admin-user-credit-history-menu";
import {
  getUserBalanceSummaries,
  listActiveSubscriptionSummaries,
  listUsers,
  type UserBalanceSummary,
} from "@/lib/db/queries";
import type { UserRole } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

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

export default async function AdminUsersPage() {
  const session = await auth();
  const currentUserId = session?.user?.id;

  const [users, activeSubscriptions] = await Promise.all([
    listUsers({ limit: 100 }),
    listActiveSubscriptionSummaries({ limit: 20 }),
  ]);
  const balanceByUserId = await getUserBalanceSummaries(
    users.map((user) => user.id)
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-xl">User management</h2>
          <p className="text-muted-foreground text-sm">
            Promote admins, suspend accounts, and monitor roles.
          </p>
        </div>
      </header>

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
            {users.map((user) => (
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
            ))}
          </tbody>
        </table>
      </div>

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
