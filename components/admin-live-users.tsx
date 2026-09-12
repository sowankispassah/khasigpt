"use client";

import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";
import { memo, type ReactNode, useEffect, useState } from "react";
import useSWR from "swr";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetcher } from "@/lib/utils";

type LiveUserRow = {
  userId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  lastSeenAt: string | Date;
  lastPath: string | null;
  device: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
};

type LiveUsersResponse = {
  windowMinutes: number;
  total: number;
  limit: number;
  offset: number;
  users: LiveUserRow[];
  updatedAt: string;
};

type PaginationDirection = "next" | "previous";

const REFRESH_INTERVAL_MS = 30_000;
const PAGE_SIZE = 50;
const LIVE_NOW_WINDOW_MINUTES = 5;
const DEFAULT_ACTIVITY_WINDOW_MINUTES = 15;
const ACTIVITY_RANGES = [
  {
    defaultText: "Last 15 minutes",
    key: "admin.live_users.range.last_15_minutes",
    value: 15,
  },
  {
    defaultText: "Last 1 hour",
    key: "admin.live_users.range.last_1_hour",
    value: 60,
  },
  {
    defaultText: "Last 24 hours",
    key: "admin.live_users.range.last_24_hours",
    value: 1440,
  },
  {
    defaultText: "Last 2 days",
    key: "admin.live_users.range.last_2_days",
    value: 2880,
  },
  {
    defaultText: "Last 7 days",
    key: "admin.live_users.range.last_7_days",
    value: 10_080,
  },
  {
    defaultText: "Last 30 days",
    key: "admin.live_users.range.last_30_days",
    value: 43_200,
  },
] as const;

function createLiveUsersKey(windowMinutes: number, offset: number) {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(offset),
    window: String(windowMinutes),
  });
  return `/api/admin/live-users?${params.toString()}`;
}

function getUpdatedDistance(updatedAt: string | undefined) {
  if (!updatedAt) {
    return null;
  }
  try {
    return formatDistanceToNow(new Date(updatedAt), { addSuffix: true });
  } catch {
    return null;
  }
}

const LiveUsersTable = memo(function LiveUsersTable({
  scope,
  users,
}: {
  scope: string;
  users: LiveUserRow[];
}) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] table-fixed text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left font-medium">
                <EditableTranslation
                  defaultText="Name"
                  description="Name column in the admin live users table."
                  translationKey="admin.live_users.table.name"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium">
                <EditableTranslation
                  defaultText="Email"
                  description="Email column in the admin live users table."
                  translationKey="admin.live_users.table.email"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium">
                <EditableTranslation
                  defaultText="Role"
                  description="Role column in the admin live users table."
                  translationKey="admin.live_users.table.role"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium">
                <EditableTranslation
                  defaultText="Last seen"
                  description="Last seen column in the admin live users table."
                  translationKey="admin.live_users.table.last_seen"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium">
                <EditableTranslation
                  defaultText="Path"
                  description="Last visited path column in the admin live users table."
                  translationKey="admin.live_users.table.path"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium">
                <EditableTranslation
                  defaultText="Device"
                  description="Device column in the admin live users table."
                  translationKey="admin.live_users.table.device"
                />
              </th>
              <th className="px-4 py-3 text-left font-medium">
                <EditableTranslation
                  defaultText="Location"
                  description="Location column in the admin live users table."
                  translationKey="admin.live_users.table.location"
                />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 text-sm">
            {users.map((user) => {
              const fullName = [user.firstName, user.lastName]
                .filter(Boolean)
                .join(" ")
                .trim();
              const location = [user.city, user.region, user.country]
                .filter(Boolean)
                .join(", ");

              return (
                <tr
                  className="bg-card/70 transition hover:bg-muted/20"
                  key={`${scope}-${user.userId}`}
                >
                  <td className="px-4 py-3 font-semibold">
                    {fullName || (
                      <EditableTranslation
                        defaultText="Unknown"
                        description="Fallback when a live user's name is unavailable."
                        translationKey="admin.live_users.value.unknown"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="block truncate">{user.email ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3 capitalize">{user.role ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {user.lastSeenAt
                      ? formatDistanceToNow(new Date(user.lastSeenAt), {
                          addSuffix: true,
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="block truncate text-muted-foreground text-xs">
                      {user.lastPath ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs capitalize">
                    {user.device ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {location || (
                      <EditableTranslation
                        defaultText="Unknown"
                        description="Fallback when a live user's location is unavailable."
                        translationKey="admin.live_users.value.unknown"
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 text-sm md:hidden">
        {users.map((user) => {
          const fullName = [user.firstName, user.lastName]
            .filter(Boolean)
            .join(" ")
            .trim();
          const location = [user.city, user.region, user.country]
            .filter(Boolean)
            .join(", ");

          return (
            <div
              className="rounded-lg border border-border/70 bg-card/70 p-4 shadow-sm"
              key={`${scope}-mobile-${user.userId}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {fullName || (
                      <EditableTranslation
                        defaultText="Unknown"
                        description="Fallback when a live user's name is unavailable."
                        translationKey="admin.live_users.value.unknown"
                      />
                    )}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {user.email ?? "—"}
                  </p>
                </div>
                <span className="rounded-full bg-secondary px-3 py-1 font-semibold text-secondary-foreground text-xs capitalize">
                  {user.role ?? "—"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground uppercase tracking-wide">
                    <EditableTranslation
                      defaultText="Last seen"
                      description="Last seen label on a mobile live-user card."
                      translationKey="admin.live_users.table.last_seen"
                    />
                  </p>
                  <p className="mt-1 font-medium">
                    {user.lastSeenAt
                      ? formatDistanceToNow(new Date(user.lastSeenAt), {
                          addSuffix: true,
                        })
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground uppercase tracking-wide">
                    <EditableTranslation
                      defaultText="Device"
                      description="Device label on a mobile live-user card."
                      translationKey="admin.live_users.table.device"
                    />
                  </p>
                  <p className="mt-1 font-medium capitalize">
                    {user.device ?? "—"}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground uppercase tracking-wide">
                    <EditableTranslation
                      defaultText="Path"
                      description="Last visited path label on a mobile live-user card."
                      translationKey="admin.live_users.table.path"
                    />
                  </p>
                  <p className="mt-1 truncate text-muted-foreground">
                    {user.lastPath ?? "—"}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground uppercase tracking-wide">
                    <EditableTranslation
                      defaultText="Location"
                      description="Location label on a mobile live-user card."
                      translationKey="admin.live_users.table.location"
                    />
                  </p>
                  <p className="mt-1 font-medium">
                    {location || (
                      <EditableTranslation
                        defaultText="Unknown"
                        description="Fallback when a live user's location is unavailable."
                        translationKey="admin.live_users.value.unknown"
                      />
                    )}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
});

function Pagination({
  data,
  isValidating,
  onNext,
  onPrevious,
  pendingDirection,
}: {
  data: LiveUsersResponse;
  isValidating: boolean;
  onNext: () => void;
  onPrevious: () => void;
  pendingDirection: PaginationDirection | null;
}) {
  const first = data.total === 0 ? 0 : data.offset + 1;
  const last = Math.min(data.offset + data.users.length, data.total);
  const hasPrevious = data.offset > 0;
  const hasNext = data.offset + data.users.length < data.total;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
      <span className="text-muted-foreground text-xs">
        <EditableTranslation
          defaultText="Showing {first}-{last} of {total} users"
          description="Pagination summary below an admin live users table."
          translationKey="admin.live_users.pagination.summary"
          values={{ first, last, total: data.total }}
        />
      </span>
      {hasPrevious || hasNext ? (
        <div className="flex gap-2">
          <Button
            className="cursor-pointer"
            disabled={!hasPrevious || isValidating || pendingDirection !== null}
            onClick={onPrevious}
            size="sm"
            type="button"
            variant="outline"
          >
            {pendingDirection === "previous" ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : null}
            <EditableTranslation
              defaultText="Previous"
              description="Button that opens the previous page of live users."
              translationKey="common.previous"
            />
          </Button>
          <Button
            className="cursor-pointer"
            disabled={!hasNext || isValidating || pendingDirection !== null}
            onClick={onNext}
            size="sm"
            type="button"
            variant="outline"
          >
            {pendingDirection === "next" ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : null}
            <EditableTranslation
              defaultText="Next"
              description="Button that opens the next page of live users."
              translationKey="common.next"
            />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function UsersSection({
  data,
  emptyDefaultText,
  emptyTranslationKey,
  error,
  headerAction,
  isLoading,
  isValidating,
  onNext,
  onPrevious,
  pendingDirection,
  scope,
  subtitle,
  title,
}: {
  data: LiveUsersResponse | undefined;
  emptyDefaultText: string;
  emptyTranslationKey: string;
  error: unknown;
  headerAction?: ReactNode;
  isLoading: boolean;
  isValidating: boolean;
  onNext: () => void;
  onPrevious: () => void;
  pendingDirection: PaginationDirection | null;
  scope: string;
  subtitle: ReactNode;
  title: ReactNode;
}) {
  const users = data?.users ?? [];
  const updatedDistance = getUpdatedDistance(data?.updatedAt);

  return (
    <section className="rounded-xl border bg-card/80 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
            {title}
          </h2>
          <p className="text-muted-foreground text-xs">{subtitle}</p>
          <div className="flex min-h-5 items-center gap-2 text-muted-foreground text-xs">
            {isValidating && data ? (
              <>
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                <EditableTranslation
                  defaultText="Refreshing..."
                  description="Status shown while a live users table refreshes."
                  translationKey="admin.live_users.status.refreshing"
                />
              </>
            ) : updatedDistance ? (
              <EditableTranslation
                defaultText="Updated {time}"
                description="Timestamp showing when a live users table was refreshed."
                translationKey="admin.live_users.status.updated"
                values={{ time: updatedDistance }}
              />
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {data ? (
            <span className="rounded-full border border-border/60 bg-background px-3 py-1 font-semibold text-muted-foreground text-xs">
              <EditableTranslation
                defaultText="{count} users"
                description="Count badge on an admin live users table."
                translationKey="admin.live_users.count"
                values={{ count: data.total }}
              />
            </span>
          ) : null}
          {headerAction}
        </div>
      </div>

      <div className="mt-4">
        {error ? (
          <p className="mb-3 text-destructive text-xs" role="alert">
            <EditableTranslation
              defaultText="Unable to load live users right now."
              description="Error shown when an admin live users table cannot be loaded."
              translationKey="admin.live_users.error"
            />
          </p>
        ) : null}

        {isLoading && users.length === 0 ? (
          <div
            aria-busy="true"
            className="flex min-h-28 items-center justify-center gap-2 text-muted-foreground text-sm"
          >
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            <EditableTranslation
              defaultText="Loading users..."
              description="Loading state for an admin live users table."
              translationKey="admin.live_users.loading"
            />
          </div>
        ) : data && users.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground text-sm">
            <EditableTranslation
              defaultText={emptyDefaultText}
              description="Empty state for an admin live users table."
              translationKey={emptyTranslationKey}
            />
          </p>
        ) : users.length > 0 ? (
          <>
            <LiveUsersTable scope={scope} users={users} />
            {data ? (
              <Pagination
                data={data}
                isValidating={isValidating}
                onNext={onNext}
                onPrevious={onPrevious}
                pendingDirection={pendingDirection}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

export function AdminLiveUsers() {
  const { translate } = useTranslation();
  const [liveOffset, setLiveOffset] = useState(0);
  const [activityOffset, setActivityOffset] = useState(0);
  const [activityWindow, setActivityWindow] = useState(
    DEFAULT_ACTIVITY_WINDOW_MINUTES
  );
  const [livePendingDirection, setLivePendingDirection] =
    useState<PaginationDirection | null>(null);
  const [activityPendingDirection, setActivityPendingDirection] =
    useState<PaginationDirection | null>(null);

  const swrOptions = {
    dedupingInterval: 5000,
    refreshInterval: REFRESH_INTERVAL_MS,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    revalidateOnFocus: false,
  } as const;

  const live = useSWR<LiveUsersResponse>(
    createLiveUsersKey(LIVE_NOW_WINDOW_MINUTES, liveOffset),
    fetcher,
    swrOptions
  );
  const activity = useSWR<LiveUsersResponse>(
    createLiveUsersKey(activityWindow, activityOffset),
    fetcher,
    swrOptions
  );

  useEffect(() => {
    if (!live.isValidating) {
      setLivePendingDirection(null);
    }
  }, [live.isValidating]);

  useEffect(() => {
    if (!activity.isValidating) {
      setActivityPendingDirection(null);
    }
  }, [activity.isValidating]);

  const changeActivityRange = (value: string) => {
    const nextRange = ACTIVITY_RANGES.find(
      (range) => String(range.value) === value
    );
    if (!nextRange || nextRange.value === activityWindow) {
      return;
    }
    setActivityOffset(0);
    setActivityWindow(nextRange.value);
  };

  const movePage = (
    direction: PaginationDirection,
    currentOffset: number,
    setOffset: (value: number) => void,
    setPendingDirection: (value: PaginationDirection | null) => void
  ) => {
    setPendingDirection(direction);
    setOffset(
      direction === "next"
        ? currentOffset + PAGE_SIZE
        : Math.max(0, currentOffset - PAGE_SIZE)
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <UsersSection
        data={live.data}
        emptyDefaultText="No users are live now."
        emptyTranslationKey="admin.live_users.empty.live"
        error={live.error}
        isLoading={live.isLoading}
        isValidating={live.isValidating}
        onNext={() =>
          movePage(
            "next",
            liveOffset,
            setLiveOffset,
            setLivePendingDirection
          )
        }
        onPrevious={() =>
          movePage(
            "previous",
            liveOffset,
            setLiveOffset,
            setLivePendingDirection
          )
        }
        pendingDirection={livePendingDirection}
        scope="live-now"
        subtitle={
          <EditableTranslation
            defaultText="Users active in the last 5 minutes."
            description="Helper text below the Live now heading."
            translationKey="admin.live_users.live.subtitle"
          />
        }
        title={
          <EditableTranslation
            defaultText="Live now"
            description="Heading for users who are currently online."
            translationKey="admin.live_users.live.title"
          />
        }
      />

      <UsersSection
        data={activity.data}
        emptyDefaultText="No users were active during this period."
        emptyTranslationKey="admin.live_users.empty.activity"
        error={activity.error}
        headerAction={
          <div className="flex items-center gap-2">
            {activity.isValidating ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : null}
            <Select
              disabled={activity.isValidating}
              onValueChange={changeActivityRange}
              value={String(activityWindow)}
            >
              <SelectTrigger
                aria-label={translate(
                  "admin.live_users.filter.label",
                  "Activity time range"
                )}
                className="w-[190px] cursor-pointer"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTIVITY_RANGES.map((range) => (
                  <SelectItem key={range.value} value={String(range.value)}>
                    <EditableTranslation
                      defaultText={range.defaultText}
                      description="Time range option for the admin live users activity table."
                      translationKey={range.key}
                    />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        isLoading={activity.isLoading}
        isValidating={activity.isValidating}
        onNext={() =>
          movePage(
            "next",
            activityOffset,
            setActivityOffset,
            setActivityPendingDirection
          )
        }
        onPrevious={() =>
          movePage(
            "previous",
            activityOffset,
            setActivityOffset,
            setActivityPendingDirection
          )
        }
        pendingDirection={activityPendingDirection}
        scope={`activity-${activityWindow}`}
        subtitle={
          <EditableTranslation
            defaultText="Users whose latest activity falls within the selected period."
            description="Helper text below the recent activity heading."
            translationKey="admin.live_users.activity.subtitle"
          />
        }
        title={
          <EditableTranslation
            defaultText="Recent activity"
            description="Heading for the filtered admin user activity table."
            translationKey="admin.live_users.activity.title"
          />
        }
      />
    </div>
  );
}
