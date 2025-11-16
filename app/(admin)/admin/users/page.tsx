import { grantUserCreditsAction, setUserActiveStateAction, setUserRoleAction } from "@/app/(admin)/actions";
import { auth } from "@/app/(auth)/auth";
import { InfoIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { RoleSubmitButton } from "@/components/role-submit-button";
import {
  getUserBalanceSummary,
  listPricingPlans,
  listUserCreditHistory,
  listUsers,
  type CreditHistoryEntry,
  type UserBalanceSummary,
} from "@/lib/db/queries";
import type { UserRole } from "@/lib/db/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await auth();
  const currentUserId = session?.user?.id;

  const [users, plans] = await Promise.all([
    listUsers({ limit: 100 }),
    listPricingPlans({ includeInactive: true, includeDeleted: true }),
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
    planId ? planNameById.get(planId) ?? null : null;
  const getUserEmail = (userId: string | null | undefined) =>
    userId ? userEmailById.get(userId) ?? null : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">User management</h2>
          <p className="text-muted-foreground text-sm">
            Promote admins, suspend accounts, and monitor roles.
          </p>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
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
              <tr key={user.id} className="border-t text-sm">
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
                  <div className="flex flex-wrap items-center gap-2">
                    <RoleToggleForm
                      currentRole={user.role as UserRole}
                      isSelf={user.id === currentUserId}
                      userId={user.id}
                    />
                    <StatusToggleForm
                      isActive={user.isActive}
                      isSelf={user.id === currentUserId}
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
    </div>
  );
}

function RoleToggleForm({
  userId,
  currentRole,
  isSelf,
}: {
  userId: string;
  currentRole: UserRole;
  isSelf: boolean;
}) {
  const roles: UserRole[] = ["regular", "creator", "admin"];

  return (
    <form
      action={async (formData) => {
        "use server";
        if (isSelf) {
          return;
        }
        const role = formData.get("role")?.toString() as UserRole | undefined;
        if (!role || role === currentRole) {
          return;
        }
        await setUserRoleAction({ userId, role });
      }}
      className="flex items-center gap-2"
    >
      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm capitalize"
        defaultValue={currentRole}
        disabled={isSelf}
        name="role"
      >
        {roles.map((role) => (
          <option className="capitalize" key={role} value={role}>
            {role}
          </option>
        ))}
      </select>
      <RoleSubmitButton disabled={isSelf} />
    </form>
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
      className="flex flex-wrap items-center gap-2"
    >
      <input name="userId" type="hidden" value={userId} />
      <input name="billingCycleDays" type="hidden" value="90" />
      <div className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
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
        className="w-80 max-h-64 space-y-2 overflow-y-auto p-3"
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
          <p className="text-xs text-muted-foreground">
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
  const createdAt = entry.createdAt instanceof Date ? entry.createdAt : new Date(entry.createdAt);
  const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
  const target = (entry.target ?? {}) as Record<string, unknown>;

  let description = entry.action;

  if (entry.action === "billing.manual_credit.grant") {
    const credits = typeof metadata.credits === "number" ? metadata.credits : null;
    const tokens = typeof metadata.tokens === "number" ? metadata.tokens : null;
    const expiresInDays = typeof metadata.expiresInDays === "number" ? metadata.expiresInDays : null;
    const actor = getUserEmail(entry.actorId) ?? "Admin";

    const parts = [
      `${actor} granted${credits !== null ? ` ${credits.toLocaleString()} credits` : ""}`,
    ];
    if (tokens !== null) {
      parts.push(`(${tokens.toLocaleString()} tokens)`);
    }
    if (expiresInDays !== null) {
      parts.push(`expires in ${expiresInDays} day${expiresInDays === 1 ? "" : "s"}`);
    }
    description = parts.join(" • ");
  } else if (entry.action === "billing.recharge") {
    const planId = (metadata.planId ?? target.planId) as string | undefined;
    const planName = getPlanName(planId) ?? planId ?? "Plan";
    description = `User activated ${planName}`;
  }

  return (
    <div className="rounded-md border bg-background p-2 shadow-sm">
      <p className="text-xs font-medium text-foreground">{description}</p>
      <p className="text-[11px] text-muted-foreground">
        {formatDistanceToNow(createdAt, { addSuffix: true })}
      </p>
    </div>
  );
}

function StatusToggleForm({
  userId,
  isActive,
  isSelf,
}: {
  userId: string;
  isActive: boolean;
  isSelf: boolean;
}) {
  return (
    <form
      action={async () => {
        "use server";
        if (isSelf) {
          return;
        }
        await setUserActiveStateAction({ userId, isActive: !isActive });
      }}
    >
      <Button
        disabled={isSelf}
        size="sm"
        type="submit"
        variant={isActive ? "destructive" : "secondary"}
      >
        {isActive ? "Suspend" : "Restore"}
      </Button>
    </form>
  );
}



