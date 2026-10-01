"use client";

import { MoreVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useState,
  useTransition,
} from "react";
import { AdminUserDeleteDialog } from "@/components/admin-user-delete-dialog";
import { AdminUserFeatureAccessDialog } from "@/components/admin-user-feature-access-dialog";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { SessionUsageChatLink } from "@/components/session-usage-chat-link";
import { toast } from "@/components/toast";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AdminUserActionsMenuProps = {
  email: string;
  emailVerificationPending: boolean;
  userId: string;
  isActive: boolean;
  allowPersonalKnowledge: boolean;
  isSelf: boolean;
  currentRole: "admin" | "creator" | "regular";
  disabled?: boolean;
  triggerLabel?: ReactNode;
  onUpdated?: (patch: UserUpdatePayload) => void;
  onDeleted?: () => void;
};

const USER_ACTION_TIMEOUT_MS = 15_000;
const IMPERSONATION_LINK_TIMEOUT_MS = 10_000;

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function readUserActionError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return fallback;
}

export type UserUpdatePayload =
  | { allowPersonalKnowledge: boolean }
  | { isActive: boolean }
  | { role: "admin" | "creator" | "regular" };

function roleLabel(role: "admin" | "creator" | "regular") {
  if (role === "admin") {
    return "Admin";
  }
  if (role === "creator") {
    return "Creator";
  }
  return "Regular";
}

function LoadingMenuLabel({
  children,
  loading,
}: {
  children: ReactNode;
  loading: boolean;
}) {
  return loading ? (
    <span className="flex items-center gap-2">
      <span className="h-4 w-4 animate-spin">
        <LoaderIcon size={16} />
      </span>
      <span>{children}</span>
    </span>
  ) : (
    children
  );
}

export function AdminUserActionsMenu({
  email,
  emailVerificationPending,
  userId,
  isActive,
  allowPersonalKnowledge,
  isSelf,
  currentRole,
  disabled = false,
  triggerLabel,
  onUpdated,
  onDeleted,
}: AdminUserActionsMenuProps) {
  const { translate } = useTranslation();
  const [open, setOpen] = useState(false);
  const [impersonationLink, setImpersonationLink] = useState<string | null>(
    null
  );
  const [impersonateError, setImpersonateError] = useState<string | null>(null);
  const [impersonateLoading, setImpersonateLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [featureAccessDialogOpen, setFeatureAccessDialogOpen] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();
  const router = useRouter();

  const handleDone = useCallback(() => {
    setOpen(false);
  }, []);

  const runUserUpdate = useCallback(
    async ({
      payload,
      pendingKey,
      successMessage,
    }: {
      payload: UserUpdatePayload;
      pendingKey: string;
      successMessage: string;
    }) => {
      if (pendingAction || disabled) {
        return;
      }

      setPendingAction(pendingKey);
      try {
        const response = await fetchWithTimeout(
          `/api/admin/users/${userId}`,
          {
            body: JSON.stringify(payload),
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            method: "PATCH",
          },
          USER_ACTION_TIMEOUT_MS
        );

        if (!response.ok) {
          throw new Error(await readUserActionError(response, translate("admin.users.actions.error", "Unable to update user.")));
        }

        toast({ description: successMessage, type: "success" });
        handleDone();
        if (onUpdated) onUpdated(payload);
        else startRefresh(() => {
          router.refresh();
        });
      } catch (error) {
        toast({
          description:
            isAbortError(error)
              ? translate("admin.users.actions.timeout", "User update timed out. Please retry.")
              : error instanceof Error
                ? error.message
                : translate("admin.users.actions.error", "Unable to update user."),
          type: "error",
        });
      } finally {
        setPendingAction(null);
      }
    },
    [disabled, handleDone, onUpdated, pendingAction, router, translate, userId]
  );

  useEffect(() => {
    if (!open) {
      setImpersonationLink(null);
      setImpersonateError(null);
      setImpersonateLoading(false);
      return;
    }
    let cancelled = false;
    setImpersonateLoading(true);
    setImpersonateError(null);
    fetchWithTimeout(
      "/api/admin/impersonate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
        credentials: "include",
      },
      IMPERSONATION_LINK_TIMEOUT_MS
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to prepare impersonation link");
        }
        const data = (await response.json()) as { url?: string };
        if (!data?.url) {
          throw new Error("No impersonation link returned");
        }
        if (!cancelled) {
          setImpersonationLink(data.url);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setImpersonateError(
            isAbortError(error)
              ? "Preparing link timed out"
              : error instanceof Error
                ? error.message
                : "Failed to prepare link"
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setImpersonateLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  return (
    <>
      <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <Button className="cursor-pointer" disabled={disabled} size="sm" type="button" variant="outline">
          <MoreVertical className="h-4 w-4" />
          {triggerLabel ?? <span className="sr-only"><EditableTranslation defaultText="Open actions" description="Open admin user actions." translationKey="admin.users.actions.open" /></span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 p-1">
        <DropdownMenuItem
          className="p-0"
          onSelect={(event) => {
            event.preventDefault();
            setOpen(false);
            setFeatureAccessDialogOpen(true);
          }}
        >
          <button
            className="flex w-full cursor-pointer items-center justify-start rounded-sm px-3 py-2 font-normal text-sm hover:bg-muted"
            type="button"
          >
            <EditableTranslation
              defaultText="Feature Access"
              description="Menu item that opens per-user feature access controls."
              translationKey="admin.users.feature_access.menu"
            />
          </button>
        </DropdownMenuItem>

        {!emailVerificationPending ? <DropdownMenuItem
          className="p-0"
          onSelect={(event) => event.preventDefault()}
        >
          <button
            className="flex w-full cursor-pointer items-center justify-start rounded-sm px-3 py-2 font-normal text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSelf || Boolean(pendingAction) || isRefreshing}
            onClick={() =>
              runUserUpdate({
                payload: { isActive: !isActive },
                pendingKey: "active",
                successMessage: isActive ? translate("admin.users.actions.suspended", "User suspended") : translate("admin.users.actions.restored", "User restored"),
              })
            }
            type="button"
          >
            <LoadingMenuLabel loading={pendingAction === "active"}>
              <EditableTranslation defaultText={pendingAction === "active" ? isActive ? "Suspending..." : "Restoring..." : isActive ? "Suspend" : "Restore"} description="Suspend or restore a user account." translationKey={`admin.users.actions.${pendingAction === "active" ? isActive ? "suspending" : "restoring" : isActive ? "suspend" : "restore"}`} />
            </LoadingMenuLabel>
          </button>
        </DropdownMenuItem> : null}

        <DropdownMenuItem
          className="p-0"
          onSelect={(event) => event.preventDefault()}
        >
          <SessionUsageChatLink
            className="flex w-full items-center rounded-sm px-3 py-2 font-normal text-sm hover:bg-muted hover:text-foreground"
            href={`/admin/users/${userId}/logs`}
          >
            <EditableTranslation defaultText="Logs" description="View user activity logs." translationKey="admin.users.actions.logs" />
          </SessionUsageChatLink>
        </DropdownMenuItem>

        <DropdownMenuItem
          className="p-0"
          onSelect={(event) => event.preventDefault()}
        >
          <button
            className="flex w-full cursor-pointer items-center justify-start rounded-sm px-3 py-2 font-normal text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSelf || Boolean(pendingAction) || isRefreshing}
            onClick={() =>
              runUserUpdate({
                payload: { allowPersonalKnowledge: !allowPersonalKnowledge },
                pendingKey: "rag",
                successMessage: translate("admin.users.actions.knowledge_updated", "Personal knowledge setting updated"),
              })
            }
            type="button"
          >
            <LoadingMenuLabel loading={pendingAction === "rag"}>
              <EditableTranslation defaultText={pendingAction === "rag" ? "Updating..." : allowPersonalKnowledge ? "Disable RAG" : "Allow RAG"} description="Update user personal knowledge access." translationKey={`admin.users.actions.${pendingAction === "rag" ? "updating" : allowPersonalKnowledge ? "disable_rag" : "allow_rag"}`} />
            </LoadingMenuLabel>
          </button>
        </DropdownMenuItem>

        <DropdownMenuItem className="p-0">
          {impersonationLink ? (
            <a
              className="flex w-full cursor-pointer items-center rounded-sm px-3 py-2 font-normal text-sm hover:bg-muted hover:text-foreground"
              href={impersonationLink}
              rel="noreferrer"
              target="_blank"
            >
              <EditableTranslation defaultText="Login as user" description="Open the user account through admin impersonation." translationKey="admin.users.actions.login" />
            </a>
          ) : (
            <button
              className="flex w-full items-center rounded-sm px-3 py-2 font-normal text-muted-foreground text-sm"
              disabled
              type="button"
            >
              <LoadingMenuLabel loading={impersonateLoading}><EditableTranslation defaultText={impersonateError ? "Login link unavailable" : "Preparing link..."} description="Admin impersonation link preparation status." translationKey={impersonateError ? "admin.users.actions.login_unavailable" : "admin.users.actions.preparing_link"} /></LoadingMenuLabel>
            </button>
          )}
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="cursor-pointer rounded-sm px-3 py-2 font-normal text-sm hover:bg-muted">
            <EditableTranslation defaultText="Update role" description="Choose a new user role." translationKey="admin.users.actions.update_role" />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            {(["admin", "creator", "regular"] as const).map((role) => (
              <DropdownMenuItem
                className="p-0"
                key={role}
                onSelect={(event) => event.preventDefault()}
              >
                <button
                  className="flex w-full cursor-pointer items-center justify-start rounded-sm px-3 py-1.5 font-normal text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    isSelf ||
                    currentRole === role ||
                    Boolean(pendingAction) ||
                    isRefreshing
                  }
                  onClick={() =>
                    runUserUpdate({
                      payload: { role },
                      pendingKey: `role:${role}`,
                      successMessage: translate("admin.users.actions.role_updated", "User role updated"),
                    })
                  }
                  type="button"
                >
                  <LoadingMenuLabel loading={pendingAction === `role:${role}`}>
                    <EditableTranslation defaultText={pendingAction === `role:${role}` ? "Updating..." : roleLabel(role)} description="User role action label." translationKey={pendingAction === `role:${role}` ? "admin.users.actions.updating" : `admin.contacts.account.role.${role}`} />
                    {currentRole === role ? <> <EditableTranslation defaultText="(current)" description="Current role indicator." translationKey="admin.users.actions.current" /></> : null}
                  </LoadingMenuLabel>
                </button>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem
          className="p-0"
          disabled={isSelf || Boolean(pendingAction) || isRefreshing}
          onSelect={(event) => {
            event.preventDefault();
            setOpen(false);
            setDeleteDialogOpen(true);
          }}
        >
          <button
            className="flex w-full cursor-pointer items-center justify-start rounded-sm px-3 py-2 font-normal text-destructive text-sm hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSelf || Boolean(pendingAction) || isRefreshing}
            type="button"
          >
            <EditableTranslation
              defaultText="Delete user"
              description="Menu item that opens the admin user deletion dialog."
              translationKey="admin.users.delete.title"
            />
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
      </DropdownMenu>
      <AdminUserDeleteDialog
        email={email}
        onDeleted={onDeleted}
        refreshOnDeleted={!onDeleted}
        onOpenChange={setDeleteDialogOpen}
        open={deleteDialogOpen}
        userId={userId}
      />
      <AdminUserFeatureAccessDialog
        email={email}
        onOpenChange={setFeatureAccessDialogOpen}
        open={featureAccessDialogOpen}
        userId={userId}
      />
    </>
  );
}
