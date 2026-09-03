"use client";

import { Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { AdminUserActionsMenu } from "@/components/admin-user-actions-menu";
import {
  AdminUsersBulkActionBar,
  AdminUsersSelectAllCheckbox,
  AdminUsersSelectionCheckbox,
  useAdminUsersSelection,
} from "@/components/admin-users-selection";
import { useTranslation } from "@/components/language-provider";
import {
  EditableTranslation,
  useEditableTranslation,
} from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  AdminUserPresenceFilter,
  AdminUserSortOption,
} from "@/lib/db/queries";
import type { UserRole } from "@/lib/db/schema";
import { doneGlobalProgress, startGlobalProgress } from "@/lib/ui/global-progress";
import { AddCreditsForm } from "./add-credits-form";

const LOAD_MORE_TIMEOUT_MS = 15_000;

type AdminUserRow = {
  allowPersonalKnowledge: boolean;
  chatCount: number;
  createdAt: string | Date;
  email: string;
  id: string;
  isActive: boolean;
  isOnline: boolean;
  lastLoginAt: string | Date | null;
  lastSeenAt: string | Date | null;
  role: UserRole;
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

type AdminUserChat = {
  createdAt: string;
  id: string;
  title: string;
};

type AdminUserChatsApiResponse = {
  data?: {
    items?: unknown;
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

function isAdminUserRow(value: unknown): value is Omit<AdminUserRow, "creditsRemaining"> {
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
    typeof row.id === "string" &&
    row.id.length > 0 &&
    typeof row.isActive === "boolean" &&
    typeof row.isOnline === "boolean" &&
    isValidDateValue(row.lastLoginAt, true) &&
    isValidDateValue(row.lastSeenAt, true) &&
    (row.role === "admin" || row.role === "creator" || row.role === "regular")
  );
}

function isAdminUserChat(value: unknown): value is AdminUserChat {
  if (!value || typeof value !== "object") {
    return false;
  }

  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    row.id.length > 0 &&
    typeof row.title === "string" &&
    typeof row.createdAt === "string" &&
    !Number.isNaN(new Date(row.createdAt).getTime())
  );
}

function toDate(value: string | Date | null) {
  if (value === null) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value: string | Date | null) {
  const date = toDate(value);
  return date
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    : null;
}

function LoadingLabel({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
      <span>{children}</span>
    </span>
  );
}

export function AdminUserChatsButton({
  chatCount,
  userId,
}: {
  chatCount: number;
  userId: string;
}) {
  const { translate } = useTranslation();
  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState<AdminUserChat[]>([]);
  const [total, setTotal] = useState(chatCount);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadErrorMessage = translate(
    "admin.users.chats.load_error",
    "Unable to load this user's chats."
  );
  const timeoutErrorMessage = translate(
    "admin.users.chats.timeout",
    "Loading this user's chats timed out."
  );

  async function loadChats() {
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);

    try {
      const params = new URLSearchParams({
        limit: "100",
        userId,
      });
      const response = await fetch(`/api/admin/chats?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as
        | AdminUserChatsApiResponse
        | null;
      if (!response.ok) {
        throw new Error(loadErrorMessage);
      }

      const items = Array.isArray(payload?.data?.items)
        ? payload.data.items.filter(isAdminUserChat)
        : [];
      setChats(items);
      setTotal(
        typeof payload?.data?.total === "number" &&
          Number.isFinite(payload.data.total)
          ? payload.data.total
          : items.length
      );
    } catch (loadError) {
      setError(
        loadError instanceof DOMException && loadError.name === "AbortError"
          ? timeoutErrorMessage
          : loadError instanceof Error
            ? loadError.message
            : loadErrorMessage
      );
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoading(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      void loadChats();
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <Button
        aria-label={translate("admin.users.chats.open", "View user chats")}
        className="cursor-pointer"
        disabled={chatCount === 0 || isLoading}
        onClick={() => handleOpenChange(true)}
        size="sm"
        type="button"
        variant="ghost"
      >
        {isLoading ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          chatCount
        )}
      </Button>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <EditableTranslation
              defaultText="User chats"
              description="Title for the popup listing chats created by one user."
              translationKey="admin.users.chats.dialog.title"
            />
          </DialogTitle>
          <DialogDescription>
            <EditableTranslation
              defaultText="Select a chat to open it as an administrator."
              description="Helper text for the user chat list popup."
              translationKey="admin.users.chats.dialog.description"
            />
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            <EditableTranslation
              defaultText="Loading chats..."
              description="Loading state shown while a user's chats are fetched."
              translationKey="admin.users.chats.loading"
            />
          </div>
        ) : error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-sm">
            <span role="alert">{error}</span>
            <Button
              className="cursor-pointer"
              disabled={isLoading}
              onClick={() => void loadChats()}
              size="sm"
              type="button"
              variant="outline"
            >
              <EditableTranslation
                defaultText="Retry"
                description="Button that retries loading a user's chats."
                translationKey="admin.users.chats.retry"
              />
            </Button>
          </div>
        ) : chats.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground text-sm">
            <EditableTranslation
              defaultText="No chats found."
              description="Empty state shown when a user has no active chats."
              translationKey="admin.users.chats.empty"
            />
          </p>
        ) : (
          <div className="grid max-h-[60vh] gap-2 overflow-y-auto">
            {chats.map((chat) => (
              <Link
                className="cursor-pointer rounded-md border px-3 py-3 transition-colors hover:bg-muted/50"
                href={`/chat/${chat.id}?admin=1`}
                key={chat.id}
                onClick={() => setOpen(false)}
              >
                <span className="block font-medium text-sm">
                  {chat.title || (
                    <EditableTranslation
                      defaultText="Untitled chat"
                      description="Fallback title for a chat without a title."
                      translationKey="admin.users.chats.untitled"
                    />
                  )}
                </span>
                <span className="mt-1 block text-muted-foreground text-xs">
                  {formatDateTime(chat.createdAt) ??
                    translate(
                      "admin.users.chats.date_unavailable",
                      "Date unavailable"
                    )}
                </span>
              </Link>
            ))}
            {total > chats.length ? (
              <p className="pt-2 text-muted-foreground text-xs">
                <EditableTranslation
                  defaultText="Showing the first {shown} of {total} chats."
                  description="Notice shown when the chat popup reaches its maximum loaded page size."
                  translationKey="admin.users.chats.showing"
                  values={{ shown: chats.length, total }}
                />
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type AdminUserAccountStatusFilter = "active" | "all" | "suspended";

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
      params.set(
        "active",
        nextAccountStatus === "active" ? "true" : "false"
      );
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
      className="flex flex-wrap items-end gap-2"
      onSubmit={handleSubmit}
    >
      <div className="min-w-0 flex-1 sm:min-w-[18rem]">
        <input
          aria-label={translate("admin.users.search.label", "Search users")}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          id="admin-user-search"
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          type="search"
          value={value}
        />
        {editButton}
      </div>
      <div className="shrink-0">
        <select
          aria-label={translate("admin.users.filters.role.label", "Role")}
          className="h-9 min-w-32 rounded-md border border-input bg-background px-2 text-sm"
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
      <div className="shrink-0">
        <select
          aria-label={translate(
            "admin.users.filters.account_status.label",
            "Account status"
          )}
          className="h-9 min-w-36 rounded-md border border-input bg-background px-2 text-sm"
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
        </select>
      </div>
      <div className="shrink-0">
        <select
          aria-label={translate("admin.users.filters.presence.label", "Presence")}
          className="h-9 min-w-32 rounded-md border border-input bg-background px-2 text-sm"
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
      <div className="shrink-0">
        <select
          aria-label={translate("admin.users.filters.sort.label", "Sort by")}
          className="h-9 min-w-44 rounded-md border border-input bg-background px-2 text-sm"
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
      </div>
      <Button
        className="cursor-pointer"
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
    </form>
  );
}

function LoadedUserRow({
  currentUserId,
  user,
}: {
  currentUserId: string | undefined;
  user: AdminUserRow;
}) {
  const createdAt = toDate(user.createdAt);
  const lastLoginAt = toDate(user.lastLoginAt);

  return (
    <tr className="border-t text-sm" key={user.id}>
      <AdminUsersSelectionCheckbox
        disabled={user.id === currentUserId}
        email={user.email}
        userId={user.id}
      />
      <td className="py-3">{user.email}</td>
      <td className="py-3 capitalize">{user.role}</td>
      <td className="py-3">
        {user.isOnline ? (
          <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-700 text-xs">
            <EditableTranslation
              defaultText="Online"
              description="Status badge for an admin user who has sent a recent presence heartbeat."
              translationKey="admin.users.status.online"
            />
          </span>
        ) : user.isActive ? (
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
        {createdAt ? (
          <time dateTime={createdAt.toISOString()}>{formatDateTime(createdAt)}</time>
        ) : (
          <EditableTranslation
            defaultText="Unavailable"
            description="Fallback when a user's signup date cannot be displayed."
            translationKey="admin.users.date.unavailable"
          />
        )}
      </td>
      <td className="py-3">
        {user.isOnline ? (
          <EditableTranslation
            defaultText="Online"
            description="Shown in the last-login column while the user is currently online."
            translationKey="admin.users.last_login.online"
          />
        ) : lastLoginAt ? (
          <time dateTime={lastLoginAt.toISOString()}>
            {formatDateTime(lastLoginAt)}
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
        <AdminUserChatsButton chatCount={user.chatCount} userId={user.id} />
      </td>
      <td className="py-3">
        <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pr-2">
          <AdminUserActionsMenu
            allowPersonalKnowledge={user.allowPersonalKnowledge}
            currentRole={user.role}
            email={user.email}
            isActive={user.isActive}
            isSelf={user.id === currentUserId}
            userId={user.id}
          />
          <AddCreditsForm
            creditsRemaining={user.creditsRemaining}
            userId={user.id}
          />
        </div>
      </td>
    </tr>
  );
}

export function AdminUsersTable({
  children,
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
  const loadMoreErrorMessage = translate(
    "admin.users.load_more.error",
    "Unable to load more users. Please retry."
  );
  const loadMoreTimeoutMessage = translate(
    "admin.users.load_more.timeout",
    "Loading users timed out. Please retry."
  );
  const [loadedUsers, setLoadedUsers] = useState<AdminUserRow[]>([]);
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
        params.set(
          "active",
          initialAccountStatus === "active" ? "true" : "false"
        );
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
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <AdminUsersSearchForm
        initialAccountStatus={initialAccountStatus}
        initialPresence={initialPresence}
        initialRole={initialRole}
        initialSearch={initialSearch}
        initialSort={initialSort}
      />
      <AdminUsersBulkActionBar />
      <div className="mt-4 overflow-x-auto">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="text-muted-foreground text-xs uppercase">
            <tr>
              <AdminUsersSelectAllCheckbox />
              <th className="py-3 text-left">
                <EditableTranslation
                  defaultText="Email"
                  description="Admin user table email column heading."
                  translationKey="admin.users.table.email"
                />
              </th>
              <th className="py-3 text-left">
                <EditableTranslation
                  defaultText="Role"
                  description="Admin user table role column heading."
                  translationKey="admin.users.table.role"
                />
              </th>
              <th className="py-3 text-left">
                <EditableTranslation
                  defaultText="Status"
                  description="Admin user table status column heading."
                  translationKey="admin.users.table.status"
                />
              </th>
              <th className="py-3 text-left">
                <EditableTranslation
                  defaultText="Signed up"
                  description="Admin user table signup date and time column heading."
                  translationKey="admin.users.table.signed_up"
                />
              </th>
              <th className="py-3 text-left">
                <EditableTranslation
                  defaultText="Last login"
                  description="Admin user table latest successful login column heading."
                  translationKey="admin.users.table.last_login"
                />
              </th>
              <th className="py-3 text-left">
                <EditableTranslation
                  defaultText="Chats"
                  description="Admin user table column showing the count of active chats created by each user."
                  translationKey="admin.users.table.chats"
                />
              </th>
              <th className="py-3 text-left">
                <EditableTranslation
                  defaultText="Actions"
                  description="Admin user table actions column heading."
                  translationKey="admin.users.table.actions"
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {children}
            {loadedUsers.map((user) => (
              <LoadedUserRow
                currentUserId={currentUserId}
                key={user.id}
                user={user}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
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
        <p className="mt-2 text-destructive text-sm" role="alert">
          {loadError}
        </p>
      ) : null}
    </div>
  );
}
