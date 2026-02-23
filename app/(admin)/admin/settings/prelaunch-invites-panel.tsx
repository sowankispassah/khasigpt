"use client";

import { formatDistanceToNow } from "date-fns";
import { Eye } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  isInviteDisabled: boolean;
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
  const [viewerInviteId, setViewerInviteId] = useState<string | null>(null);
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
  const viewerInvite = useMemo(
    () => invites.find((invite) => invite.id === viewerInviteId) ?? null,
    [invites, viewerInviteId]
  );
  const viewerInviteUsers = useMemo(() => {
    if (!viewerInvite) {
      return [];
    }
    return joinedUsersByInvite.get(viewerInvite.id) ?? [];
  }, [joinedUsersByInvite, viewerInvite]);
  const viewerSearchInputValue =
    viewerInviteId ? joinedUserSearchByInvite[viewerInviteId] ?? "" : "";
  const viewerSearchQuery = viewerSearchInputValue.trim().toLowerCase();
  const filteredViewerInviteUsers =
    viewerSearchQuery.length === 0
      ? viewerInviteUsers
      : viewerInviteUsers.filter((entry) => {
          const normalizedEmail = (entry.userEmail ?? "").toLowerCase();
          const normalizedUserId = entry.userId.toLowerCase();
          return (
            normalizedEmail.includes(viewerSearchQuery) ||
            normalizedUserId.includes(viewerSearchQuery)
          );
        });
  const viewerTotalPages = Math.max(
    1,
    Math.ceil(filteredViewerInviteUsers.length / JOINED_USERS_PAGE_SIZE)
  );
  const viewerRequestedPage = viewerInviteId
    ? (joinedUserPageByInvite[viewerInviteId] ?? 1)
    : 1;
  const viewerCurrentPage = Math.min(
    Math.max(viewerRequestedPage, 1),
    viewerTotalPages
  );
  const viewerPageStart = (viewerCurrentPage - 1) * JOINED_USERS_PAGE_SIZE;
  const pagedViewerInviteUsers = filteredViewerInviteUsers.slice(
    viewerPageStart,
    viewerPageStart + JOINED_USERS_PAGE_SIZE
  );

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
          <table className="min-w-max border-collapse whitespace-nowrap text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Invite</th>
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Assigned to</th>
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Owner</th>
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Invite link</th>
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Status</th>
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Redemptions</th>
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Actions</th>
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
                  <tr className="border-t" key={invite.id}>
                      <td className="px-3 py-3 align-top">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <span className="font-medium">
                            {invite.label?.trim() || "Untitled invite"}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            Created {formatRelativeDate(invite.createdAt)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex min-w-[360px] items-center gap-2 whitespace-nowrap">
                          <input
                            className="min-w-[220px] rounded-md border bg-background px-2 py-1 text-xs"
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
                          <div className="flex items-center gap-2 whitespace-nowrap">
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
                          {invite.redemptionCount} / {inviteLimit}{" "}
                          <span className="text-muted-foreground">
                            | Active access: {invite.activeAccessCount}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex items-center gap-2 whitespace-nowrap">
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
                              setViewerInviteId(invite.id);
                            }}
                            title="View users joined via this invite"
                            type="button"
                            variant="outline"
                          >
                            <Eye size={14} />
                          </Button>
                        </div>
                      </td>
                  </tr>
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

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setViewerInviteId(null);
          }
        }}
        open={Boolean(viewerInviteId)}
      >
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewerInvite?.label?.trim() || "Invite users"}</DialogTitle>
            <DialogDescription>
              {viewerInvite
                ? `Users who joined using ${viewerInvite.token}`
                : "Users who joined via this invite."}
            </DialogDescription>
          </DialogHeader>

          {!viewerInvite ? null : viewerInviteUsers.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No users joined using this link yet.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <input
                  className="w-full max-w-sm rounded-md border bg-background px-2 py-1 text-xs"
                  disabled={Boolean(pendingAction)}
                  onChange={(event) => {
                    if (!viewerInviteId) {
                      return;
                    }
                    const value = event.target.value;
                    setJoinedUserSearchByInvite((previous) => ({
                      ...previous,
                      [viewerInviteId]: value,
                    }));
                    setJoinedUserPageByInvite((previous) => ({
                      ...previous,
                      [viewerInviteId]: 1,
                    }));
                  }}
                  placeholder="Search by email or user ID"
                  value={viewerSearchInputValue}
                />
                <span className="text-muted-foreground text-xs">
                  Showing {pagedViewerInviteUsers.length} of {filteredViewerInviteUsers.length}
                </span>
              </div>

              {filteredViewerInviteUsers.length === 0 ? (
                <p className="text-muted-foreground text-xs">No users match this search.</p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-md border bg-background">
                    <table className="min-w-full border-collapse text-xs">
                      <thead className="bg-muted/30">
                        <tr>
                          <th className="px-2 py-2 text-left font-medium">User</th>
                          <th className="px-2 py-2 text-left font-medium">Joined</th>
                          <th className="px-2 py-2 text-left font-medium">Access</th>
                          <th className="px-2 py-2 text-left font-medium">Invite link</th>
                          <th className="px-2 py-2 text-left font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedViewerInviteUsers.map((entry) => {
                          const revokeAccessActionKey = `revoke-access:${entry.inviteId}:${entry.userId}`;
                          const disableRedeemerActionKey = `disable-redeemer:${entry.inviteId}:${entry.userId}`;
                          const enableRedeemerActionKey = `enable-redeemer:${entry.inviteId}:${entry.userId}`;

                          return (
                            <tr
                              className="border-t"
                              key={`${entry.inviteId}:${entry.userId}:${entry.redeemedAt}`}
                            >
                              <td className="px-2 py-2">{entry.userEmail ?? entry.userId}</td>
                              <td className="px-2 py-2">{formatRelativeDate(entry.redeemedAt)}</td>
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
                                <span
                                  className={cn(
                                    "rounded-full px-2 py-0.5 font-medium",
                                    entry.isInviteDisabled
                                      ? "bg-rose-100 text-rose-700"
                                      : "bg-blue-100 text-blue-700"
                                  )}
                                >
                                  {entry.isInviteDisabled ? "Disabled" : "Enabled"}
                                </span>
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-2">
                                  {entry.isInviteDisabled ? (
                                    <Button
                                      className="h-6 px-2 text-[11px]"
                                      disabled={Boolean(pendingAction)}
                                      onClick={() => {
                                        void runMutation(
                                          enableRedeemerActionKey,
                                          {
                                            action: "enableRedeemer",
                                            inviteId: entry.inviteId,
                                            userId: entry.userId,
                                          },
                                          "Invite link re-enabled for user."
                                        );
                                      }}
                                      type="button"
                                      variant="outline"
                                    >
                                      {pendingAction === enableRedeemerActionKey
                                        ? "Enabling..."
                                        : "Enable link"}
                                    </Button>
                                  ) : (
                                    <Button
                                      className="h-6 border-rose-300 px-2 text-[11px] text-rose-700 hover:bg-rose-50"
                                      disabled={Boolean(pendingAction)}
                                      onClick={() => {
                                        void runMutation(
                                          disableRedeemerActionKey,
                                          {
                                            action: "disableRedeemer",
                                            inviteId: entry.inviteId,
                                            userId: entry.userId,
                                          },
                                          "Invite link disabled for user."
                                        );
                                      }}
                                      type="button"
                                      variant="outline"
                                    >
                                      {pendingAction === disableRedeemerActionKey
                                        ? "Disabling..."
                                        : "Disable link"}
                                    </Button>
                                  )}

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
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {viewerTotalPages > 1 ? (
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-muted-foreground text-xs">
                        Page {viewerCurrentPage} of {viewerTotalPages}
                      </span>
                      <Button
                        className="h-6 px-2 text-[11px]"
                        disabled={Boolean(pendingAction) || viewerCurrentPage <= 1}
                        onClick={() => {
                          if (!viewerInviteId) {
                            return;
                          }
                          setJoinedUserPageByInvite((previous) => ({
                            ...previous,
                            [viewerInviteId]: Math.max(viewerCurrentPage - 1, 1),
                          }));
                        }}
                        type="button"
                        variant="outline"
                      >
                        Previous
                      </Button>
                      <Button
                        className="h-6 px-2 text-[11px]"
                        disabled={Boolean(pendingAction) || viewerCurrentPage >= viewerTotalPages}
                        onClick={() => {
                          if (!viewerInviteId) {
                            return;
                          }
                          setJoinedUserPageByInvite((previous) => ({
                            ...previous,
                            [viewerInviteId]: Math.min(viewerCurrentPage + 1, viewerTotalPages),
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
        </DialogContent>
      </Dialog>

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
  isInviteDisabled: boolean;
}): InviteJoinedUserItem {
  return {
    inviteId: entry.inviteId,
    userId: entry.userId,
    userEmail: entry.userEmail,
    redeemedAt: toIsoDateString(entry.redeemedAt),
    hasActiveAccess: entry.hasActiveAccess,
    isInviteDisabled: entry.isInviteDisabled,
  };
}
