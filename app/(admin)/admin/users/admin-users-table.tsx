"use client";

import { Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  AdminUsersBulkActionBar,
  AdminUsersSelectAllCheckbox,
  useAdminUsersSelection,
} from "@/components/admin-users-selection";
import { useTranslation } from "@/components/language-provider";
import {
  EditableTranslation,
  useEditableTranslation,
} from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import type { AdminUserAccountStatusFilter } from "@/lib/admin/user-account-status";
import type {
  AdminUserPresenceFilter,
  AdminUserSortOption,
} from "@/lib/db/queries";
import type { UserRole } from "@/lib/db/schema";
import { doneGlobalProgress, startGlobalProgress } from "@/lib/ui/global-progress";
import { cn } from "@/lib/utils";
import {
  AdminUserCreditsCell,
  AdminUserRow,
  type AdminUserRowData,
  USER_COLUMN_CLASSES,
} from "./admin-user-row";

const LOAD_MORE_TIMEOUT_MS = 15_000;

type LoadedAdminUser = AdminUserRowData & {
  lastSeenAt: string | Date | null;
  creditsRemaining: number | null;
};

type AdminUsersApiResponse = {
  data?: {
    balances?: Record<string, unknown>;
    items?: unknown;
    limit?: unknown;
    page?: unknown;
    total?: unknown;
  };
  message?: string;
};

function isValidDateValue(value: unknown, allowNull = false): value is string | Date | null {
  if (allowNull && value === null) {
    return true;
  }
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function isAdminUserRow(value: unknown): value is Omit<LoadedAdminUser, "creditsRemaining"> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const row = value as Record<string, unknown>;
  return (
    typeof row.allowPersonalKnowledge === "boolean" &&
    typeof row.chatCount === "number" &&
    Number.isFinite(row.chatCount) &&
    row.chatCount >= 0 &&
    isValidDateValue(row.createdAt) &&
    typeof row.email === "string" &&
    row.email.length > 0 &&
    typeof row.emailVerificationPending === "boolean" &&
    typeof row.id === "string" &&
    row.id.length > 0 &&
    typeof row.isActive === "boolean" &&
    typeof row.isOnline === "boolean" &&
    isValidDateValue(row.lastLoginAt, true) &&
    isValidDateValue(row.lastSeenAt, true) &&
    (row.role === "admin" || row.role === "creator" || row.role === "regular")
  );
}

function LoadingLabel({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
      <span>{children}</span>
    </span>
  );
}

type AdminUsersFilterValues = {
  accountStatus: AdminUserAccountStatusFilter;
  presence: AdminUserPresenceFilter;
  role: UserRole | "all";
  search: string;
  sort: AdminUserSortOption;
};

function AdminUsersSearchForm({
  initialAccountStatus,
  initialPresence,
  initialRole,
  initialSearch,
  initialSort,
}: {
  initialAccountStatus: AdminUserAccountStatusFilter;
  initialPresence: AdminUserPresenceFilter;
  initialRole: UserRole | "all";
  initialSearch: string;
  initialSort: AdminUserSortOption;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialSearch);
  const [accountStatus, setAccountStatus] = useState(initialAccountStatus);
  const [presence, setPresence] = useState(initialPresence);
  const [role, setRole] = useState(initialRole);
  const [sort, setSort] = useState(initialSort);
  const filtersRef = useRef<AdminUsersFilterValues>({
    accountStatus: initialAccountStatus,
    presence: initialPresence,
    role: initialRole,
    search: initialSearch,
    sort: initialSort,
  });
  const [isPending, startTransition] = useTransition();
  const { translate } = useTranslation();
  const { editButton: recentChatEditButton, text: recentChatLabel } =
    useEditableTranslation(
      "admin.users.filters.sort.recent_chat",
      "Recent chat",
      "Sort option that places users with the latest sent chat message first."
    );
  const { editButton, text: placeholder } = useEditableTranslation(
    "admin.users.search.placeholder",
    "Search by email, name, or user ID",
    "Placeholder for searching users by keyword."
  );

  useEffect(() => {
    filtersRef.current = {
      accountStatus: initialAccountStatus,
      presence: initialPresence,
      role: initialRole,
      search: initialSearch,
      sort: initialSort,
    };
    setValue(initialSearch);
    setAccountStatus(initialAccountStatus);
    setPresence(initialPresence);
    setRole(initialRole);
    setSort(initialSort);
  }, [
    initialAccountStatus,
    initialPresence,
    initialRole,
    initialSearch,
    initialSort,
  ]);

  useEffect(() => {
    if (!isPending) {
      doneGlobalProgress();
    }
  }, [isPending]);

  function applyFilters(
    overrides: Partial<AdminUsersFilterValues> = {}
  ) {
    const nextFilters: AdminUsersFilterValues = {
      ...filtersRef.current,
      ...overrides,
      search: (overrides.search ?? value).trim(),
    };
    filtersRef.current = nextFilters;

    const {
      accountStatus: nextAccountStatus,
      presence: nextPresence,
      role: nextRole,
      search: nextSearch,
      sort: nextSort,
    } = nextFilters;
    const params = new URLSearchParams();
    if (nextSearch) {
      params.set("q", nextSearch);
    }
    if (nextRole !== "all") {
      params.set("role", nextRole);
    }
    if (nextAccountStatus !== "all") {
      params.set("active", nextAccountStatus);
    }
    if (nextPresence !== "all") {
      params.set("presence", nextPresence);
    }
    if (nextSort !== "created_desc") {
      params.set("sort", nextSort);
    }

    startGlobalProgress();
    startTransition(() => {
      router.replace(
        params.size > 0 ? `/admin/users?${params}` : "/admin/users",
        { scroll: false }
      );
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyFilters({ search: value });
  }

  return (
    <form
      aria-busy={isPending}
      className="flex flex-col gap-2 lg:flex-row lg:items-center"
      onSubmit={handleSubmit}
    >
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          aria-label={translate("admin.users.search.label", "Search users")}
          className="h-9 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          id="admin-user-search"
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          type="search"
          value={value}
        />
        {editButton}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      <div className="min-w-0">
        <select
          aria-label={translate("admin.users.filters.role.label", "Role")}
          className="h-9 w-full cursor-pointer rounded-lg border border-input bg-background px-2.5 text-sm sm:w-auto"
          id="admin-user-role"
          onChange={(event) => {
            const nextRole = event.target.value as UserRole | "all";
            setRole(nextRole);
            applyFilters({ role: nextRole });
          }}
          value={role}
        >
          <option value="all">
            {translate("admin.users.filters.role.all", "All roles")}
          </option>
          <option value="admin">
            {translate("admin.users.filters.role.admin", "Admins")}
          </option>
          <option value="creator">
            {translate("admin.users.filters.role.creator", "Creators")}
          </option>
          <option value="regular">
            {translate("admin.users.filters.role.regular", "Regular users")}
          </option>
        </select>
      </div>
      <div className="min-w-0">
        <select
          aria-label={translate(
            "admin.users.filters.account_status.label",
            "Account status"
          )}
          className="h-9 w-full cursor-pointer rounded-lg border border-input bg-background px-2.5 text-sm sm:w-auto"
          id="admin-user-account-status"
          onChange={(event) => {
            const nextAccountStatus = event.target
              .value as AdminUserAccountStatusFilter;
            setAccountStatus(nextAccountStatus);
            applyFilters({ accountStatus: nextAccountStatus });
          }}
          value={accountStatus}
        >
          <option value="all">
            {translate("admin.users.filters.account_status.all", "All statuses")}
          </option>
          <option value="active">
            {translate("admin.users.filters.account_status.active", "Active")}
          </option>
          <option value="suspended">
            {translate(
              "admin.users.filters.account_status.suspended",
              "Suspended"
            )}
          </option>
          <option value="not_verified">
            {translate("admin.users.filters.account_status.not_verified", "Not verified")}
          </option>
        </select>
      </div>
      <div className="min-w-0">
        <select
          aria-label={translate("admin.users.filters.presence.label", "Presence")}
          className="h-9 w-full cursor-pointer rounded-lg border border-input bg-background px-2.5 text-sm sm:w-auto"
          id="admin-user-presence"
          onChange={(event) => {
            const nextPresence = event.target
              .value as AdminUserPresenceFilter;
            setPresence(nextPresence);
            applyFilters({ presence: nextPresence });
          }}
          value={presence}
        >
          <option value="all">
            {translate("admin.users.filters.presence.all", "All users")}
          </option>
          <option value="online">
            {translate("admin.users.filters.presence.online", "Online now")}
          </option>
          <option value="offline">
            {translate("admin.users.filters.presence.offline", "Offline")}
          </option>
        </select>
      </div>
      <div className="min-w-0">
        <select
          aria-label={translate("admin.users.filters.sort.label", "Sort by")}
          className="h-9 w-full cursor-pointer rounded-lg border border-input bg-background px-2.5 text-sm sm:w-auto"
          id="admin-user-sort"
          onChange={(event) => {
            const nextSort = event.target.value as AdminUserSortOption;
            setSort(nextSort);
            applyFilters({ sort: nextSort });
          }}
          value={sort}
        >
          <option value="created_desc">
            {translate("admin.users.filters.sort.newest", "Newest signups")}
          </option>
          <option value="created_asc">
            {translate("admin.users.filters.sort.oldest", "Oldest signups")}
          </option>
          <option value="recent_chat">
            {recentChatLabel}
          </option>
          <option value="last_login_desc">
            {translate(
              "admin.users.filters.sort.last_login_newest",
              "Latest login"
            )}
          </option>
          <option value="last_login_asc">
            {translate(
              "admin.users.filters.sort.last_login_oldest",
              "Oldest login"
            )}
          </option>
          <option value="online_first">
            {translate("admin.users.filters.sort.online_first", "Online first")}
          </option>
          <option value="email_asc">
            {translate("admin.users.filters.sort.email_asc", "Email A-Z")}
          </option>
          <option value="email_desc">
            {translate("admin.users.filters.sort.email_desc", "Email Z-A")}
          </option>
        </select>
        {sort === "recent_chat" ? recentChatEditButton : null}
      </div>
      <Button
        className="col-span-2 h-9 cursor-pointer sm:col-span-1"
        disabled={isPending}
        type="submit"
        variant="secondary"
      >
        {isPending ? (
          <LoadingLabel>
            <EditableTranslation
              defaultText="Searching..."
              description="Button label shown while the admin user search is loading."
              translationKey="admin.users.search.searching"
            />
          </LoadingLabel>
        ) : (
          <span className="flex items-center gap-2">
            <Search aria-hidden="true" className="h-4 w-4" />
            <EditableTranslation
              defaultText="Search"
              description="Button label that searches the admin user list."
              translationKey="admin.users.search.submit"
            />
          </span>
        )}
      </Button>
      </div>
    </form>
  );
}

export function AdminUsersTable({
  children,
  notice,
  currentUserId,
  initialAccountStatus,
  initialPage,
  initialPresence,
  initialRole,
  initialSearch,
  initialUserIds,
  initialSort,
  pageSize,
  totalUsers,
  totalUsersConfirmed,
}: {
  children: ReactNode;
  /** Warning shown above the table, e.g. when balances could not load. */
  notice?: ReactNode;
  currentUserId: string | undefined;
  initialAccountStatus: AdminUserAccountStatusFilter;
  initialPage: number;
  initialPresence: AdminUserPresenceFilter;
  initialRole: UserRole | "all";
  initialSearch: string;
  initialUserIds: string[];
  initialSort: AdminUserSortOption;
  pageSize: number;
  totalUsers: number;
  totalUsersConfirmed: boolean;
}) {
  const { translate } = useTranslation();
  const { registerVisibleUserIds } = useAdminUsersSelection();
  const router = useRouter();
  const loadMoreErrorMessage = translate(
    "admin.users.load_more.error",
    "Unable to load more users. Please retry."
  );
  const loadMoreTimeoutMessage = translate(
    "admin.users.load_more.timeout",
    "Loading users timed out. Please retry."
  );
  const [loadedUsers, setLoadedUsers] = useState<LoadedAdminUser[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nextPage, setNextPage] = useState(initialPage + 1);
  const [hasMore, setHasMore] = useState(
    totalUsersConfirmed && initialPage * pageSize < totalUsers
  );

  useEffect(() => {
    setLoadedUsers([]);
    setLoadError(null);
    setNextPage(initialPage + 1);
    setHasMore(totalUsersConfirmed && initialPage * pageSize < totalUsers);
  }, [initialPage, pageSize, totalUsers, totalUsersConfirmed]);

  useEffect(() => {
    registerVisibleUserIds(loadedUsers.map((user) => user.id));
  }, [loadedUsers, registerVisibleUserIds]);

  async function handleLoadMore() {
    if (isLoadingMore || !hasMore) {
      return;
    }

    setIsLoadingMore(true);
    setLoadError(null);
    startGlobalProgress();
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      LOAD_MORE_TIMEOUT_MS
    );

    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        page: String(nextPage),
      });
      if (initialSearch) {
        params.set("q", initialSearch);
      }
      if (initialRole !== "all") {
        params.set("role", initialRole);
      }
      if (initialAccountStatus !== "all") {
        params.set("active", initialAccountStatus);
      }
      if (initialPresence !== "all") {
        params.set("presence", initialPresence);
      }
      if (initialSort !== "created_desc") {
        params.set("sort", initialSort);
      }

      const response = await fetch(`/api/admin/users?${params}`, {
        credentials: "include",
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as
        | AdminUsersApiResponse
        | null;
      if (!response.ok) {
        throw new Error(
          typeof payload?.message === "string"
            ? payload.message
            : loadMoreErrorMessage
        );
      }

      const rawItems = Array.isArray(payload?.data?.items)
        ? payload.data.items
        : [];
      const balances = payload?.data?.balances ?? {};
      const existingIds = new Set([
        ...initialUserIds,
        ...loadedUsers.map((user) => user.id),
      ]);
      const nextUsers = rawItems
        .filter(isAdminUserRow)
        .filter((user) => !existingIds.has(user.id))
        .map((user) => {
          const creditsRemaining = balances[user.id];
          return {
            ...user,
            creditsRemaining:
              typeof creditsRemaining === "number" &&
              Number.isFinite(creditsRemaining)
                ? creditsRemaining
                : null,
          };
        });

      setLoadedUsers((current) => [...current, ...nextUsers]);
      setNextPage((current) => current + 1);
      const returnedPage =
        typeof payload?.data?.page === "number"
          ? payload.data.page
          : nextPage;
      const returnedTotal =
        typeof payload?.data?.total === "number"
          ? payload.data.total
          : totalUsers;
      setHasMore(
        returnedPage * pageSize < returnedTotal && rawItems.length > 0
      );
    } catch (error) {
      setLoadError(
        error instanceof DOMException && error.name === "AbortError"
          ? loadMoreTimeoutMessage
          : error instanceof Error
            ? error.message
            : loadMoreErrorMessage
      );
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoadingMore(false);
      doneGlobalProgress();
    }
  }

  const shownCount = Math.min(
    totalUsers,
    initialUserIds.length + loadedUsers.length
  );

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="border-b p-4">
        <AdminUsersSearchForm
          initialAccountStatus={initialAccountStatus}
          initialPresence={initialPresence}
          initialRole={initialRole}
          initialSearch={initialSearch}
          initialSort={initialSort}
        />
        <AdminUsersBulkActionBar />
      </div>
      {notice ? <div className="border-b px-4 py-3">{notice}</div> : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm [&_td]:px-4 [&_th]:px-4">
          <thead className="border-b bg-muted/40 text-muted-foreground text-xs">
            <tr>
              <AdminUsersSelectAllCheckbox />
              <th className="py-2.5 text-left font-medium" scope="col">
                <EditableTranslation
                  defaultText="User"
                  description="Admin user table column with each user email and role."
                  translationKey="admin.users.table.user"
                />
              </th>
              <th className={cn("py-2.5 text-left font-medium", USER_COLUMN_CLASSES.status)} scope="col">
                <EditableTranslation
                  defaultText="Status"
                  description="Admin user table status column heading."
                  translationKey="admin.users.table.status"
                />
              </th>
              <th className={cn("py-2.5 text-left font-medium", USER_COLUMN_CLASSES.credits)} scope="col">
                <EditableTranslation
                  defaultText="Credits"
                  description="Admin user table column with each user remaining credit balance."
                  translationKey="admin.users.table.credits"
                />
              </th>
              <th className={cn("py-2.5 text-left font-medium", USER_COLUMN_CLASSES.chats)} scope="col">
                <EditableTranslation
                  defaultText="Chats"
                  description="Admin user table column showing the count of active chats created by each user."
                  translationKey="admin.users.table.chats"
                />
              </th>
              <th className={cn("py-2.5 text-left font-medium", USER_COLUMN_CLASSES.joined)} scope="col">
                <EditableTranslation
                  defaultText="Joined"
                  description="Admin user table signup date column heading."
                  translationKey="admin.users.table.joined"
                />
              </th>
              <th className={cn("py-2.5 text-left font-medium", USER_COLUMN_CLASSES.lastActive)} scope="col">
                <EditableTranslation
                  defaultText="Last active"
                  description="Admin user table column showing online status or the latest successful login."
                  translationKey="admin.users.table.last_active"
                />
              </th>
              <th className="py-2.5 text-right font-medium" scope="col">
                <span className="sr-only">
                  <EditableTranslation
                    defaultText="Actions"
                    description="Admin user table actions column heading."
                    translationKey="admin.users.table.actions"
                  />
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {children}
            {loadedUsers.map((user) => (
              <AdminUserRow
                creditsSlot={
                  <AdminUserCreditsCell
                    creditsRemaining={user.creditsRemaining}
                    email={user.email}
                    userId={user.id}
                  />
                }
                currentUserId={currentUserId}
                key={user.id}
                onUpdated={(patch) => {
                  setLoadedUsers((current) => current.map((row) => row.id === user.id ? { ...row, ...patch } : row));
                  router.refresh();
                }}
                user={user}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
        <span className="text-muted-foreground">
          {totalUsersConfirmed ? (
            <EditableTranslation
              defaultText="Showing {shown} of {total} users"
              description="Admin user table count showing how many filtered users are currently visible."
              translationKey="admin.users.table.showing"
              values={{ shown: shownCount, total: totalUsers }}
            />
          ) : (
            <EditableTranslation
              defaultText="User count unavailable"
              description="Shown when the admin user count cannot be confirmed."
              translationKey="admin.users.table.count_unavailable"
            />
          )}
        </span>
        {hasMore ? (
          <Button
            className="cursor-pointer"
            disabled={isLoadingMore}
            onClick={handleLoadMore}
            type="button"
            variant="outline"
          >
            {isLoadingMore ? (
              <LoadingLabel>
                <EditableTranslation
                  defaultText="Loading..."
                  description="Button label shown while more admin users are loading."
                  translationKey="admin.users.load_more.loading"
                />
              </LoadingLabel>
            ) : (
              <EditableTranslation
                defaultText="Load more"
                description="Button label that appends the next users to the current admin user list."
                translationKey="admin.users.load_more.button"
              />
            )}
          </Button>
        ) : totalUsers > 0 ? (
          <span className="text-muted-foreground text-xs">
            <EditableTranslation
              defaultText="All users loaded"
              description="Message shown when every filtered admin user is visible."
              translationKey="admin.users.load_more.complete"
            />
          </span>
        ) : null}
      </div>
      {loadError ? (
        <p className="px-4 pb-3 text-destructive text-sm" role="alert">
          {loadError}
        </p>
      ) : null}
    </section>
  );
}
