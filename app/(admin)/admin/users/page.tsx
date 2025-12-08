import { formatDistanceToNow } from "date-fns";
import {
  grantUserCreditsAction,
  setUserActiveStateAction,
  setUserPersonalKnowledgePermissionAction,
  setUserRoleAction,
} from "@/app/(admin)/actions";
import { auth } from "@/app/(auth)/auth";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { AdminUserActionsMenu } from "@/components/admin-user-actions-menu";
import { InfoIcon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  type CreditHistoryEntry,
  getUserBalanceSummary,
  listActiveSubscriptionSummaries,
  listPricingPlans,
  listUserCreditHistory,
  listUsers,
  type UserBalanceSummary,
} from "@/lib/db/queries";
import type { UserRole } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await auth();
  const currentUserId = session?.user?.id;

  const [users, plans, activeSubscriptions] = await Promise.all([
    listUsers({ limit: 100 }),
    listPricingPlans({ includeInactive: true, includeDeleted: true }),
    listActiveSubscriptionSummaries({ limit: 20 }),
  ]);

  const planNameById = new Map(plans.map((plan) => [plan.id, plan.name]));
  const userEmailById = new Map(users.map((user) => [user.id, user.email]));

  const usersWithData = await Promise.all(
    users.map(async (user) => {
      const [balance, history] = await Promise.all([
        getUserBalanceSummary(user.id),
        listUserCreditHistory({ userId: user.id, limit: 8 }),
      ]);

      return { user, balance, history };
    })
  );

  const getPlanName = (planId: string | null | undefined) =>
    planId ? (planNameById.get(planId) ?? null) : null;
  const getUserEmail = (userId: string | null | undefined) =>
    userId ? (userEmailById.get(userId) ?? null) : null;

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
            {usersWithData.map(({ user, balance, history }) => (
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
                      balance={balance}
                      getPlanName={getPlanName}
                      getUserEmail={getUserEmail}
                      history={history}
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
  history,
  getPlanName,
  getUserEmail,
}: {
  userId: string;
  balance: UserBalanceSummary;
  history: CreditHistoryEntry[];
  getPlanName: (planId: string | null | undefined) => string | null;
  getUserEmail: (userId: string | null | undefined) => string | null;
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
        <CreditHistoryButton
          getPlanName={getPlanName}
          getUserEmail={getUserEmail}
          history={history}
        />
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

function CreditHistoryButton({
  history,
  getPlanName,
  getUserEmail,
}: {
  history: CreditHistoryEntry[];
  getPlanName: (planId: string | null | undefined) => string | null;
  getUserEmail: (userId: string | null | undefined) => string | null;
}) {
  const hasHistory = history.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-5 w-5 items-center justify-center rounded-full transition-colors hover:bg-background/60 hover:text-foreground"
          type="button"
        >
          <InfoIcon size={10} />
          <span className="sr-only">View credit history</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-64 w-80 space-y-2 overflow-y-auto p-3"
        side="top"
      >
        {hasHistory ? (
          history.map((entry) => (
            <CreditHistoryItem
              entry={entry}
              getPlanName={getPlanName}
              getUserEmail={getUserEmail}
              key={entry.id}
            />
          ))
        ) : (
          <p className="text-muted-foreground text-xs">
            No credit activity recorded yet.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CreditHistoryItem({
  entry,
  getPlanName,
  getUserEmail,
}: {
  entry: CreditHistoryEntry;
  getPlanName: (planId: string | null | undefined) => string | null;
  getUserEmail: (userId: string | null | undefined) => string | null;
}) {
  const createdAt =
    entry.createdAt instanceof Date
      ? entry.createdAt
      : new Date(entry.createdAt);
  const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
  const target = (entry.target ?? {}) as Record<string, unknown>;

  let description = entry.action;

  if (entry.action === "billing.manual_credit.grant") {
    const credits =
      typeof metadata.credits === "number" ? metadata.credits : null;
    const tokens = typeof metadata.tokens === "number" ? metadata.tokens : null;
    const expiresInDays =
      typeof metadata.expiresInDays === "number"
        ? metadata.expiresInDays
        : null;
    const actor = getUserEmail(entry.actorId) ?? "Admin";

    const parts = [
      `${actor} granted${credits !== null ? ` ${credits.toLocaleString()} credits` : ""}`,
    ];
    if (tokens !== null) {
      parts.push(`(${tokens.toLocaleString()} tokens)`);
    }
    if (expiresInDays !== null) {
      parts.push(
        `expires in ${expiresInDays} day${expiresInDays === 1 ? "" : "s"}`
      );
    }
    description = parts.join(" • ");
  } else if (entry.action === "billing.recharge") {
    const planId = (metadata.planId ?? target.planId) as string | undefined;
    const planName = getPlanName(planId) ?? planId ?? "Plan";
    description = `User activated ${planName}`;
  }

  return (
    <div className="rounded-md border bg-background p-2 shadow-sm">
      <p className="font-medium text-foreground text-xs">{description}</p>
      <p className="text-[11px] text-muted-foreground">
        {formatDistanceToNow(createdAt, { addSuffix: true })}
      </p>
    </div>
  );
}
