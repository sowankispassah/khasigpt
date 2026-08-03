"use client";

import { Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useState,
  useTransition,
} from "react";
import { AdminUserActionsMenu } from "@/components/admin-user-actions-menu";
import { useTranslation } from "@/components/language-provider";
import {
  EditableTranslation,
  useEditableTranslation,
} from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import type { UserRole } from "@/lib/db/schema";
import { doneGlobalProgress, startGlobalProgress } from "@/lib/ui/global-progress";
import { AddCreditsForm } from "./add-credits-form";

const LOAD_MORE_TIMEOUT_MS = 15_000;

type AdminUserRow = {
  allowPersonalKnowledge: boolean;
  createdAt: string | Date;
  email: string;
  id: string;
  isActive: boolean;
  lastLoginAt: string | Date | null;
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
    isValidDateValue(row.createdAt) &&
    typeof row.email === "string" &&
    row.email.length > 0 &&
    typeof row.id === "string" &&
    row.id.length > 0 &&
    typeof row.isActive === "boolean" &&
    isValidDateValue(row.lastLoginAt, true) &&
    (row.role === "admin" || row.role === "creator" || row.role === "regular")
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

function AdminUsersSearchForm({ initialSearch }: { initialSearch: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialSearch);
  const [isPending, startTransition] = useTransition();
  const { editButton, text: placeholder } = useEditableTranslation(
    "admin.users.search.placeholder",
    "Search by email, name, or user ID",
    "Placeholder for searching users by keyword."
  );

  useEffect(() => {
    setValue(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    if (!isPending) {
      doneGlobalProgress();
    }
  }, [isPending]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const search = value.trim();
    const params = new URLSearchParams();
    if (search) {
      params.set("q", search);
    }

    startGlobalProgress();
    startTransition(() => {
      router.push(params.size > 0 ? `/admin/users?${params}` : "/admin/users");
    });
  }

  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={handleSubmit}>
      <div className="min-w-0 flex-1 space-y-1 sm:min-w-[18rem]">
        <label className="font-medium text-sm" htmlFor="admin-user-search">
          <EditableTranslation
            defaultText="Search users"
            description="Label for the admin user keyword search field."
            translationKey="admin.users.search.label"
          />
        </label>
        <input
          aria-label="Search users"
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          id="admin-user-search"
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          type="search"
          value={value}
        />
        {editButton}
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
        {lastLoginAt ? (
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
        <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pr-2">
          <AdminUserActionsMenu
            allowPersonalKnowledge={user.allowPersonalKnowledge}
            currentRole={user.role}
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
  initialPage,
  initialSearch,
  initialUserIds,
  pageSize,
  totalUsers,
  totalUsersConfirmed,
}: {
  children: ReactNode;
  currentUserId: string | undefined;
  initialPage: number;
  initialSearch: string;
  initialUserIds: string[];
  pageSize: number;
  totalUsers: number;
  totalUsersConfirmed: boolean;
}) {
  const { translate } = useTranslation();
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
      <AdminUsersSearchForm initialSearch={initialSearch} />
      <div className="mt-4 overflow-x-auto">
        <table className="w-full whitespace-nowrap text-sm">
          <thead className="text-muted-foreground text-xs uppercase">
            <tr>
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
