"use client";

import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react";
import { memo, useMemo, useState } from "react";
import useSWR from "swr";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
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

const REFRESH_INTERVAL_MS = 30_000;

const LiveUsersSection = memo(function LiveUsersSection({
  title,
  windowMinutes,
  defaultOpen = false,
}: {
  title: string;
  windowMinutes: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const swrKey = open
    ? `/api/admin/live-users?window=${windowMinutes}`
    : null;

  const { data, error, isLoading } = useSWR<LiveUsersResponse>(
    swrKey,
    fetcher,
    {
      refreshInterval: open ? REFRESH_INTERVAL_MS : 0,
      keepPreviousData: true,
    }
  );

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? 0;

  const updatedLabel = useMemo(() => {
    if (!data?.updatedAt) {
      return "Updated just now";
    }
    try {
      return `Updated ${formatDistanceToNow(new Date(data.updatedAt), {
        addSuffix: true,
      })}`;
    } catch {
      return "Updated just now";
    }
  }, [data?.updatedAt]);

  const emptyState = open && !isLoading && users.length === 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section className="rounded-xl border bg-card/80 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
              {title}
            </h2>
            <p className="text-xs text-muted-foreground">
              {open ? updatedLabel : "Open to load live users."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-semibold text-muted-foreground">
              {open ? `${total} users` : "—"}
            </span>
            <CollapsibleTrigger asChild>
              <Button
                className="cursor-pointer"
                size="sm"
                type="button"
                variant="outline"
              >
                {open ? "Hide" : "Show"}
                {open ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent className="mt-4">
          {error ? (
            <p className="text-destructive text-xs">
              Unable to load live users right now.
            </p>
          ) : null}

          {isLoading && users.length === 0 ? (
            <p className="text-muted-foreground text-xs">Loading users…</p>
          ) : emptyState ? (
            <p className="text-muted-foreground text-xs">
              No users active in the last {windowMinutes} minutes.
            </p>
          ) : (
            <>
              <div className="hidden md:block">
                <table className="w-full min-w-[900px] table-fixed text-sm">
                  <thead className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Name</th>
                      <th className="px-4 py-3 text-left font-medium">Email</th>
                      <th className="px-4 py-3 text-left font-medium">Role</th>
                      <th className="px-4 py-3 text-left font-medium">
                        Last seen
                      </th>
                      <th className="px-4 py-3 text-left font-medium">Path</th>
                      <th className="px-4 py-3 text-left font-medium">
                        Device
                      </th>
                      <th className="px-4 py-3 text-left font-medium">
                        Location
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
                          key={`${user.userId}-${windowMinutes}`}
                        >
                          <td className="px-4 py-3">
                            <div className="font-semibold">
                              {fullName || "Unknown"}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="block truncate">
                              {user.email ?? "N/A"}
                            </span>
                          </td>
                          <td className="px-4 py-3 capitalize">
                            {user.role ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">
                            {user.lastSeenAt
                              ? formatDistanceToNow(
                                  new Date(user.lastSeenAt),
                                  { addSuffix: true }
                                )
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="block truncate text-xs text-muted-foreground">
                              {user.lastPath ?? "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs capitalize">
                            {user.device ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">
                            {location || "Unknown"}
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
                      key={`${user.userId}-${windowMinutes}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold">
                            {fullName || "Unknown"}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {user.email ?? "N/A"}
                          </p>
                        </div>
                        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground capitalize">
                          {user.role ?? "—"}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-muted-foreground uppercase tracking-wide">
                            Last seen
                          </p>
                          <p className="mt-1 font-medium">
                            {user.lastSeenAt
                              ? formatDistanceToNow(
                                  new Date(user.lastSeenAt),
                                  { addSuffix: true }
                                )
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground uppercase tracking-wide">
                            Device
                          </p>
                          <p className="mt-1 font-medium capitalize">
                            {user.device ?? "—"}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-muted-foreground uppercase tracking-wide">
                            Path
                          </p>
                          <p className="mt-1 truncate text-muted-foreground">
                            {user.lastPath ?? "—"}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-muted-foreground uppercase tracking-wide">
                            Location
                          </p>
                          <p className="mt-1 font-medium">
                            {location || "Unknown"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {total > limit ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Showing the most recent {limit} of {total} active users.
                </p>
              ) : null}
            </>
          )}
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
});

export function AdminLiveUsers() {
  return (
    <div className="flex flex-col gap-6">
      <LiveUsersSection title="Live now" windowMinutes={5} defaultOpen />
      <LiveUsersSection title="Active in last 15 minutes" windowMinutes={15} />
      <LiveUsersSection title="Active in last 60 minutes" windowMinutes={60} />
    </div>
  );
}
