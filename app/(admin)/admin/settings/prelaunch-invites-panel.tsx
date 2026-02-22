"use client";

import { formatDistanceToNow } from "date-fns";
import { Eye, EyeOff } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRELAUNCH_INVITE_API_ENDPOINT = "/api/admin/settings/prelaunch-invites";
const REQUEST_TIMEOUT_MS = 12_000;
const JOINED_USERS_PAGE_SIZE = 10;

type InviteListItem = {
  id: string;
  token: string;
  label: string | null;
  assignedToEmail: string | null;
  createdByAdminEmail: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  activeAccessCount: number;
  createdAt: string;
  revokedAt: string | null;
};

type InviteAccessItem = {
  userId: string;
  userEmail: string | null;
  inviteId: string;
  inviteToken: string;
  inviteLabel: string | null;
  grantedAt: string;
};

type InviteJoinedUserItem = {
  inviteId: string;
  userId: string;
  userEmail: string | null;
  redeemedAt: string;
  hasActiveAccess: boolean;
};

type InviteStateResponse = {
  invites: InviteListItem[];
  access: InviteAccessItem[];
  joinedUsers: InviteJoinedUserItem[];
};

function toIsoDateString(value: Date | string | null | undefined): string {
  if (!value) {
    return new Date(0).toISOString();
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? new Date(0).toISOString() : value.toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(0).toISOString();
  }

  return parsed.toISOString();
}

function formatRelativeDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "recently";
  }
  return formatDistanceToNow(date, { addSuffix: true });
}

async function requestWithTimeout<T>(url: string, init: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => null)) as
      | ({ error?: string; message?: string } & T)
      | null;
    if (!response.ok || !payload) {
      const message =
        typeof payload?.message === "string"
          ? payload.message
          : typeof payload?.error === "string"
            ? payload.error
            : "Request failed.";
      throw new Error(message);
    }

    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Request timed out.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function PrelaunchInvitesPanel({
  appBaseUrl,
  initialAccess,
  initialInvites,
  initialJoinedUsers,
}: {
  appBaseUrl: string | null;
  initialAccess: InviteAccessItem[];
  initialInvites: InviteListItem[];
  initialJoinedUsers: InviteJoinedUserItem[];
}) {
  const [invites, setInvites] = useState<InviteListItem[]>(initialInvites);
  const [access, setAccess] = useState<InviteAccessItem[]>(initialAccess);
  const [joinedUsers, setJoinedUsers] =
    useState<InviteJoinedUserItem[]>(initialJoinedUsers);
  const [inviteLabel, setInviteLabel] = useState("");
  const [inviteAssignedToEmail, setInviteAssignedToEmail] = useState("");
  const [inviteMaxRedemptions, setInviteMaxRedemptions] = useState("1");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [expandedInviteId, setExpandedInviteId] = useState<string | null>(null);
  const [assignedEmailDraftByInvite, setAssignedEmailDraftByInvite] = useState<
    Record<string, string>
  >({});
  const [joinedUserSearchByInvite, setJoinedUserSearchByInvite] = useState<
    Record<string, string>
  >({});
  const [joinedUserPageByInvite, setJoinedUserPageByInvite] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const resolvedBaseUrl = useMemo(() => {
    const normalized =
      typeof appBaseUrl === "string" && appBaseUrl.trim().length > 0
        ? appBaseUrl.trim().replace(/\/+$/, "")
        : "";
    if (normalized) {
      return normalized;
    }
    return origin.replace(/\/+$/, "");
  }, [appBaseUrl, origin]);

  const joinedUsersByInvite = useMemo(() => {
    const map = new Map<string, InviteJoinedUserItem[]>();
    for (const row of joinedUsers) {
      const existing = map.get(row.inviteId) ?? [];
      existing.push(row);
      map.set(row.inviteId, existing);
    }
    return map;
  }, [joinedUsers]);

  const applyState = (state: InviteStateResponse) => {
    setInvites(state.invites);
    setAccess(state.access);
    setJoinedUsers(state.joinedUsers);
  };

  const refreshState = async () => {
    if (pendingAction) {
      return;
    }

    setPendingAction("refresh");
    try {
      const state = await requestWithTimeout<InviteStateResponse>(
        PRELAUNCH_INVITE_API_ENDPOINT,
        { method: "GET" }
      );
      applyState(state);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to refresh invites.";
      toast({ type: "error", description: message });
    } finally {
      setPendingAction(null);
    }
  };

  useEffect(() => {
    void refreshState();
  }, []);

  const runMutation = async (
    actionKey: string,
    body: Record<string, unknown>,
    successMessage: string
  ) => {
    if (pendingAction) {
      return;
    }

    setPendingAction(actionKey);
    try {
      const response = await requestWithTimeout<
        InviteStateResponse & { ok: boolean }
      >(PRELAUNCH_INVITE_API_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      applyState(response);
      toast({ type: "success", description: successMessage });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update invites.";
      toast({ type: "error", description: message });
    } finally {
      setPendingAction(null);
    }
  };

  const onCreateInvite = async () => {
    const parsed = Number.parseInt(inviteMaxRedemptions, 10);
    const maxRedemptions = Number.isFinite(parsed) ? Math.floor(parsed) : 1;
    await runMutation(
      "create",
      {
        action: "create",
        label: inviteLabel,
        assignedToEmail: inviteAssignedToEmail,
        maxRedemptions,
      },
      "Invite link created."
    );
    setInviteLabel("");
    setInviteAssignedToEmail("");
    setInviteMaxRedemptions("1");
  };

  return (
    <div className="space-y-4 rounded-lg border bg-background p-4">
      <div className="space-y-1">
        <h3 className="font-semibold text-sm">Prelaunch invites</h3>
        <p className="text-muted-foreground text-xs">
          Generate invite links for prelaunch access with a custom redemption
          limit. Invite-only prelaunch only applies when Public launched is off
          and Under maintenance is off.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_220px_180px_auto]">
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          disabled={Boolean(pendingAction)}
          onChange={(event) => {
            setInviteLabel(event.target.value);
          }}
          placeholder="Invite label (optional)"
          value={inviteLabel}
        />
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          disabled={Boolean(pendingAction)}
          onChange={(event) => {
            setInviteAssignedToEmail(event.target.value);
          }}
          placeholder="Assigned email (optional)"
          type="email"
          value={inviteAssignedToEmail}
        />
        <input
          className="rounded-md border bg-background px-3 py-2 text-sm"
          disabled={Boolean(pendingAction)}
          max={10000}
          min={1}
          onChange={(event) => {
            setInviteMaxRedemptions(event.target.value);
          }}
          placeholder="Redeem limit"
          step={1}
          type="number"
          value={inviteMaxRedemptions}
        />
        <Button
          disabled={Boolean(pendingAction)}
          onClick={() => {
            void onCreateInvite();
          }}
          type="button"
        >
          {pendingAction === "create" ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin">
                <LoaderIcon size={16} />
              </span>
              <span>Creating...</span>
            </span>
          ) : (
            "Create invite link"
          )}
        </Button>
      </div>

      {invites.length > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Invite</th>
                <th className="px-3 py-2 text-left font-medium">Assigned to</th>
                <th className="px-3 py-2 text-left font-medium">Owner</th>
                <th className="px-3 py-2 text-left font-medium">Invite link</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Redemptions</th>
                <th className="px-3 py-2 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => {
                const invitePath = `/invite/${invite.token}`;
                const inviteUrl = resolvedBaseUrl
                  ? `${resolvedBaseUrl}${invitePath}`
                  : invitePath;
                const isRevoked = Boolean(invite.revokedAt);
                const inviteLimit = Math.max(1, Number(invite.maxRedemptions ?? 1));
                const inviteUsers = joinedUsersByInvite.get(invite.id) ?? [];
                const searchInputValue = joinedUserSearchByInvite[invite.id] ?? "";
                const searchQuery = searchInputValue.trim().toLowerCase();
                const filteredInviteUsers =
                  searchQuery.length === 0
                    ? inviteUsers
                    : inviteUsers.filter((entry) => {
                        const normalizedEmail = (entry.userEmail ?? "").toLowerCase();
                        const normalizedUserId = entry.userId.toLowerCase();
                        return (
                          normalizedEmail.includes(searchQuery) ||
                          normalizedUserId.includes(searchQuery)
                        );
                      });
                const totalPages = Math.max(
                  1,
                  Math.ceil(filteredInviteUsers.length / JOINED_USERS_PAGE_SIZE)
                );
                const requestedPage = joinedUserPageByInvite[invite.id] ?? 1;
                const currentPage = Math.min(Math.max(requestedPage, 1), totalPages);
                const pageStart = (currentPage - 1) * JOINED_USERS_PAGE_SIZE;
                const pagedInviteUsers = filteredInviteUsers.slice(
                  pageStart,
                  pageStart + JOINED_USERS_PAGE_SIZE
                );
                const isExpanded = expandedInviteId === invite.id;
                const assignedToDraft =
                  assignedEmailDraftByInvite[invite.id] ?? invite.assignedToEmail ?? "";
                const normalizedAssignedToDraft = assignedToDraft.trim().toLowerCase();
                const normalizedStoredAssignedTo =
                  (invite.assignedToEmail ?? "").trim().toLowerCase();
                const hasAssignedToChanges =
                  normalizedAssignedToDraft !== normalizedStoredAssignedTo;
                const toggleActionKey = `toggle:${invite.id}`;
                const deleteActionKey = `delete:${invite.id}`;
                const updateAssignedActionKey = `assign:${invite.id}`;
                const clearAssignedActionKey = `assign-clear:${invite.id}`;

                return (
                  <Fragment key={invite.id}>
                    <tr className="border-t">
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">
                            {invite.label?.trim() || "Untitled invite"}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            Created {formatRelativeDate(invite.createdAt)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex min-w-[220px] flex-col gap-2">
                          <input
                            className="rounded-md border bg-background px-2 py-1 text-xs"
                            disabled={Boolean(pendingAction)}
                            onChange={(event) => {
                              const value = event.target.value;
                              setAssignedEmailDraftByInvite((previous) => ({
                                ...previous,
                                [invite.id]: value,
                              }));
                            }}
                            placeholder="Unassigned"
                            type="email"
                            value={assignedToDraft}
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              className="h-6 px-2 text-[11px]"
                              disabled={Boolean(pendingAction) || !hasAssignedToChanges}
                              onClick={() => {
                                void runMutation(
                                  updateAssignedActionKey,
                                  {
                                    action: "updateAssignedTo",
                                    inviteId: invite.id,
                                    assignedToEmail: normalizedAssignedToDraft,
                                  },
                                  normalizedAssignedToDraft
                                    ? "Invite assignment updated."
                                    : "Invite assignment cleared."
                                );
                              }}
                              type="button"
                              variant="outline"
                            >
                              {pendingAction === updateAssignedActionKey
                                ? "Saving..."
                                : "Save"}
                            </Button>
                            <Button
                              className="h-6 px-2 text-[11px]"
                              disabled={Boolean(pendingAction)}
                              onClick={() => {
                                setAssignedEmailDraftByInvite((previous) => ({
                                  ...previous,
                                  [invite.id]: "",
                                }));
                                void runMutation(
                                  clearAssignedActionKey,
                                  {
                                    action: "updateAssignedTo",
                                    inviteId: invite.id,
                                    assignedToEmail: null,
                                  },
                                  "Invite assignment cleared."
                                );
                              }}
                              type="button"
                              variant="outline"
                            >
                              {pendingAction === clearAssignedActionKey
                                ? "Clearing..."
                                : "Clear"}
                            </Button>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top text-xs">
                        {invite.createdByAdminEmail ?? "Unknown admin"}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <input
                          className="w-full min-w-[260px] rounded-md border bg-muted/30 px-2 py-1 font-mono text-xs"
                          readOnly
                          value={inviteUrl}
                        />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 font-medium text-xs",
                            isRevoked
                              ? "bg-rose-100 text-rose-700"
                              : "bg-emerald-100 text-emerald-700"
                          )}
                        >
                          {isRevoked ? "Inactive" : "Active"}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top text-xs">
                        <div>
                          {invite.redemptionCount} / {inviteLimit}
                        </div>
                        <div className="text-muted-foreground">
                          Active access: {invite.activeAccessCount}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            className="h-7 px-2 text-xs"
                            disabled={Boolean(pendingAction)}
                            onClick={() => {
                              const action = isRevoked ? "activateInvite" : "revokeInvite";
                              const label = isRevoked
                                ? "Invite marked active."
                                : "Invite marked inactive.";
                              void runMutation(
                                toggleActionKey,
                                { action, inviteId: invite.id },
                                label
                              );
                            }}
                            type="button"
                            variant="outline"
                          >
                            {pendingAction === toggleActionKey
                              ? "Saving..."
                              : isRevoked
                                ? "Make active"
                                : "Make inactive"}
                          </Button>
                          <Button
                            className="h-7 border-rose-300 px-2 text-rose-700 text-xs hover:bg-rose-50"
                            disabled={Boolean(pendingAction)}
                            onClick={() => {
                              if (
                                typeof window !== "undefined" &&
                                !window.confirm("Delete this invite permanently?")
                              ) {
                                return;
                              }
                              void runMutation(
                                deleteActionKey,
                                { action: "deleteInvite", inviteId: invite.id },
                                "Invite deleted."
                              );
                            }}
                            type="button"
                            variant="outline"
                          >
                            {pendingAction === deleteActionKey ? "Deleting..." : "Delete"}
                          </Button>
                          <Button
                            className="h-7 px-2"
                            disabled={Boolean(pendingAction)}
                            onClick={() => {
                              setExpandedInviteId((current) =>
                                current === invite.id ? null : invite.id
                              );
                            }}
                            title="View users joined via this invite"
                            type="button"
                            variant="outline"
                          >
                            {isExpanded ? <EyeOff size={14} /> : <Eye size={14} />}
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="border-t bg-muted/20">
                        <td className="px-3 py-3" colSpan={7}>
                          <div className="space-y-2">
                            <div className="font-medium text-xs uppercase tracking-wide">
                              Users joined with this invite
                            </div>
                            {inviteUsers.length === 0 ? (
                              <p className="text-muted-foreground text-xs">
                                No users joined using this link yet.
                              </p>
                            ) : (
                              <div className="space-y-2">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <input
                                    className="w-full max-w-sm rounded-md border bg-background px-2 py-1 text-xs"
                                    disabled={Boolean(pendingAction)}
                                    onChange={(event) => {
                                      const value = event.target.value;
                                      setJoinedUserSearchByInvite((previous) => ({
                                        ...previous,
                                        [invite.id]: value,
                                      }));
                                      setJoinedUserPageByInvite((previous) => ({
                                        ...previous,
                                        [invite.id]: 1,
                                      }));
                                    }}
                                    placeholder="Search by email or user ID"
                                    value={searchInputValue}
                                  />
                                  <span className="text-muted-foreground text-xs">
                                    Showing {pagedInviteUsers.length} of {filteredInviteUsers.length}
                                  </span>
                                </div>

                                {filteredInviteUsers.length === 0 ? (
                                  <p className="text-muted-foreground text-xs">
                                    No users match this search.
                                  </p>
                                ) : (
                                  <>
                                    <div className="overflow-x-auto rounded-md border bg-background">
                                      <table className="min-w-full border-collapse text-xs">
                                        <thead className="bg-muted/30">
                                          <tr>
                                            <th className="px-2 py-2 text-left font-medium">
                                              User
                                            </th>
                                            <th className="px-2 py-2 text-left font-medium">
                                              Joined
                                            </th>
                                            <th className="px-2 py-2 text-left font-medium">
                                              Access
                                            </th>
                                            <th className="px-2 py-2 text-left font-medium">
                                              Action
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {pagedInviteUsers.map((entry) => {
                                            const revokeAccessActionKey = `revoke-access:${entry.inviteId}:${entry.userId}`;
                                            return (
                                              <tr
                                                className="border-t"
                                                key={`${entry.inviteId}:${entry.userId}:${entry.redeemedAt}`}
                                              >
                                                <td className="px-2 py-2">
                                                  {entry.userEmail ?? entry.userId}
                                                </td>
                                                <td className="px-2 py-2">
                                                  {formatRelativeDate(entry.redeemedAt)}
                                                </td>
                                                <td className="px-2 py-2">
                                                  <span
                                                    className={cn(
                                                      "rounded-full px-2 py-0.5 font-medium",
                                                      entry.hasActiveAccess
                                                        ? "bg-emerald-100 text-emerald-700"
                                                        : "bg-zinc-200 text-zinc-700"
                                                    )}
                                                  >
                                                    {entry.hasActiveAccess ? "Active" : "Revoked"}
                                                  </span>
                                                </td>
                                                <td className="px-2 py-2">
                                                  {entry.hasActiveAccess ? (
                                                    <Button
                                                      className="h-6 px-2 text-[11px]"
                                                      disabled={Boolean(pendingAction)}
                                                      onClick={() => {
                                                        void runMutation(
                                                          revokeAccessActionKey,
                                                          {
                                                            action: "revokeAccess",
                                                            inviteId: entry.inviteId,
                                                            userId: entry.userId,
                                                          },
                                                          "User access revoked."
                                                        );
                                                      }}
                                                      type="button"
                                                      variant="outline"
                                                    >
                                                      {pendingAction === revokeAccessActionKey
                                                        ? "Revoking..."
                                                        : "Revoke access"}
                                                    </Button>
                                                  ) : (
                                                    <span className="text-muted-foreground">
                                                      -
                                                    </span>
                                                  )}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                    {totalPages > 1 ? (
                                      <div className="flex items-center justify-end gap-2">
                                        <span className="text-muted-foreground text-xs">
                                          Page {currentPage} of {totalPages}
                                        </span>
                                        <Button
                                          className="h-6 px-2 text-[11px]"
                                          disabled={Boolean(pendingAction) || currentPage <= 1}
                                          onClick={() => {
                                            setJoinedUserPageByInvite((previous) => ({
                                              ...previous,
                                              [invite.id]: Math.max(currentPage - 1, 1),
                                            }));
                                          }}
                                          type="button"
                                          variant="outline"
                                        >
                                          Previous
                                        </Button>
                                        <Button
                                          className="h-6 px-2 text-[11px]"
                                          disabled={Boolean(pendingAction) || currentPage >= totalPages}
                                          onClick={() => {
                                            setJoinedUserPageByInvite((previous) => ({
                                              ...previous,
                                              [invite.id]: Math.min(currentPage + 1, totalPages),
                                            }));
                                          }}
                                          type="button"
                                          variant="outline"
                                        >
                                          Next
                                        </Button>
                                      </div>
                                    ) : null}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          No prelaunch invites created yet.
        </p>
      )}

      <div className="flex justify-end">
        <Button
          disabled={Boolean(pendingAction)}
          onClick={() => {
            void refreshState();
          }}
          type="button"
          variant="outline"
        >
          {pendingAction === "refresh" ? "Refreshing..." : "Refresh invites"}
        </Button>
      </div>
    </div>
  );
}

export function mapInviteForClient(invite: {
  id: string;
  token: string;
  label: string | null;
  assignedToEmail: string | null;
  createdByAdminEmail: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  activeAccessCount: number;
  createdAt: Date | string | null;
  revokedAt: Date | string | null;
}): InviteListItem {
  return {
    id: invite.id,
    token: invite.token,
    label: invite.label,
    assignedToEmail: invite.assignedToEmail,
    createdByAdminEmail: invite.createdByAdminEmail,
    maxRedemptions: invite.maxRedemptions,
    redemptionCount: invite.redemptionCount,
    activeAccessCount: invite.activeAccessCount,
    createdAt: toIsoDateString(invite.createdAt),
    revokedAt: invite.revokedAt ? toIsoDateString(invite.revokedAt) : null,
  };
}

export function mapInviteAccessForClient(access: {
  userId: string;
  userEmail: string | null;
  inviteId: string;
  inviteToken: string;
  inviteLabel: string | null;
  grantedAt: Date | string | null;
}): InviteAccessItem {
  return {
    userId: access.userId,
    userEmail: access.userEmail,
    inviteId: access.inviteId,
    inviteToken: access.inviteToken,
    inviteLabel: access.inviteLabel,
    grantedAt: toIsoDateString(access.grantedAt),
  };
}

export function mapInviteJoinedUserForClient(entry: {
  inviteId: string;
  userId: string;
  userEmail: string | null;
  redeemedAt: Date | string | null;
  hasActiveAccess: boolean;
}): InviteJoinedUserItem {
  return {
    inviteId: entry.inviteId,
    userId: entry.userId,
    userEmail: entry.userEmail,
    redeemedAt: toIsoDateString(entry.redeemedAt),
    hasActiveAccess: entry.hasActiveAccess,
  };
}
