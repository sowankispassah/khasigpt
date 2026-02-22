"use client";

import { formatDistanceToNow } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { LoaderIcon } from "@/components/icons";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRELAUNCH_INVITE_API_ENDPOINT = "/api/admin/settings/prelaunch-invites";
const REQUEST_TIMEOUT_MS = 12_000;

type InviteListItem = {
  id: string;
  token: string;
  label: string | null;
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

type InviteStateResponse = {
  invites: InviteListItem[];
  access: InviteAccessItem[];
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
}: {
  appBaseUrl: string | null;
  initialAccess: InviteAccessItem[];
  initialInvites: InviteListItem[];
}) {
  const [invites, setInvites] = useState<InviteListItem[]>(initialInvites);
  const [access, setAccess] = useState<InviteAccessItem[]>(initialAccess);
  const [inviteLabel, setInviteLabel] = useState("");
  const [inviteMaxRedemptions, setInviteMaxRedemptions] = useState("1");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

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

  const applyState = (state: InviteStateResponse) => {
    setInvites(state.invites);
    setAccess(state.access);
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
        maxRedemptions,
      },
      "Invite link created."
    );
    setInviteLabel("");
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

      <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
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
        <div className="space-y-3">
          {invites.map((invite) => {
            const invitePath = `/invite/${invite.token}`;
            const inviteUrl = resolvedBaseUrl
              ? `${resolvedBaseUrl}${invitePath}`
              : invitePath;
            const isRevoked = Boolean(invite.revokedAt);
            const inviteLimit = Math.max(1, Number(invite.maxRedemptions ?? 1));
            const isExhausted = invite.redemptionCount >= inviteLimit;
            const statusLabel = isRevoked
              ? "Inactive"
              : isExhausted
                ? "Exhausted"
                : "Active";
            const revokeActionKey = `revoke:${invite.id}`;
            const deleteActionKey = `delete:${invite.id}`;

            return (
              <div className="space-y-2 rounded-md border bg-card p-3" key={invite.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="font-medium text-sm">
                      {invite.label?.trim() || "Untitled invite"}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      Created {formatRelativeDate(invite.createdAt)}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-medium text-xs",
                      isRevoked
                        ? "bg-rose-100 text-rose-700"
                        : isExhausted
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                    )}
                  >
                    {statusLabel}
                  </span>
                </div>

                <input
                  className="w-full rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs"
                  readOnly
                  value={inviteUrl}
                />

                <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-xs">
                  <span>
                    Redemptions: {invite.redemptionCount} / {inviteLimit} | Active
                    access: {invite.activeAccessCount}
                  </span>
                  <div className="flex items-center gap-2">
                    {!isRevoked ? (
                      <Button
                        className="h-7 px-2 text-xs"
                        disabled={Boolean(pendingAction)}
                        onClick={() => {
                          void runMutation(
                            revokeActionKey,
                            { action: "revokeInvite", inviteId: invite.id },
                            "Invite marked inactive."
                          );
                        }}
                        type="button"
                        variant="outline"
                      >
                        {pendingAction === revokeActionKey ? "Saving..." : "Make inactive"}
                      </Button>
                    ) : null}
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
                      {pendingAction === deleteActionKey ? "Deleting..." : "Delete invite"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          No prelaunch invites created yet.
        </p>
      )}

      {access.length > 0 ? (
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Active invited users</h4>
          {access.map((entry) => {
            const actionKey = `revoke-access:${entry.inviteId}:${entry.userId}`;
            return (
              <div
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card p-3"
                key={`${entry.userId}-${entry.inviteId}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm">{entry.userEmail ?? entry.userId}</p>
                  <p className="text-muted-foreground text-xs">
                    Granted {formatRelativeDate(entry.grantedAt)}
                  </p>
                </div>
                <Button
                  className="h-7 px-2 text-xs"
                  disabled={Boolean(pendingAction)}
                  onClick={() => {
                    void runMutation(
                      actionKey,
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
                  {pendingAction === actionKey ? "Revoking..." : "Revoke access"}
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}

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
