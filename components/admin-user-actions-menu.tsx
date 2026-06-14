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
import { LoaderIcon } from "@/components/icons";
import { SessionUsageChatLink } from "@/components/session-usage-chat-link";
import { toast } from "@/components/toast";
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
  userId: string;
  isActive: boolean;
  allowPersonalKnowledge: boolean;
  isSelf: boolean;
  currentRole: "admin" | "creator" | "regular";
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

async function readUserActionError(response: Response) {
  const data = await response.json().catch(() => null);
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return "Unable to update user.";
}

type UserUpdatePayload =
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
  userId,
  isActive,
  allowPersonalKnowledge,
  isSelf,
  currentRole,
}: AdminUserActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [impersonationLink, setImpersonationLink] = useState<string | null>(
    null
  );
  const [impersonateError, setImpersonateError] = useState<string | null>(null);
  const [impersonateLoading, setImpersonateLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
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
      if (pendingAction) {
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
          throw new Error(await readUserActionError(response));
        }

        toast({ description: successMessage, type: "success" });
        handleDone();
        startRefresh(() => {
          router.refresh();
        });
      } catch (error) {
        toast({
          description:
            isAbortError(error)
              ? "User update timed out. Please retry."
              : error instanceof Error
                ? error.message
                : "Unable to update user.",
          type: "error",
        });
      } finally {
        setPendingAction(null);
      }
    },
    [handleDone, pendingAction, router, userId]
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
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          <MoreVertical className="h-4 w-4" />
          <span className="sr-only">Open actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 p-1">
        <DropdownMenuItem
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
                successMessage: isActive ? "User suspended" : "User restored",
              })
            }
            type="button"
          >
            <LoadingMenuLabel loading={pendingAction === "active"}>
              {pendingAction === "active"
                ? isActive
                  ? "Suspending..."
                  : "Restoring..."
                : isActive
                  ? "Suspend"
                  : "Restore"}
            </LoadingMenuLabel>
          </button>
        </DropdownMenuItem>

        <DropdownMenuItem
          className="p-0"
          onSelect={(event) => event.preventDefault()}
        >
          <SessionUsageChatLink
            className="flex w-full items-center rounded-sm px-3 py-2 font-normal text-sm hover:bg-muted hover:text-foreground"
            href={`/admin/users/${userId}/logs`}
          >
            Logs
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
                successMessage: "Personal knowledge setting updated",
              })
            }
            type="button"
          >
            <LoadingMenuLabel loading={pendingAction === "rag"}>
              {pendingAction === "rag"
                ? "Updating..."
                : allowPersonalKnowledge
                  ? "Disable RAG"
                  : "Allow RAG"}
            </LoadingMenuLabel>
          </button>
        </DropdownMenuItem>

        <DropdownMenuItem className="p-0">
          {impersonationLink ? (
            <a
              className="flex w-full items-center rounded-sm px-3 py-2 font-normal text-sm hover:bg-muted hover:text-foreground"
              href={impersonationLink}
              rel="noreferrer"
              target="_blank"
            >
              Login as user
            </a>
          ) : (
            <button
              className="flex w-full items-center rounded-sm px-3 py-2 font-normal text-muted-foreground text-sm"
              disabled
              type="button"
            >
              {impersonateLoading
                ? "Preparing link..."
                : (impersonateError ?? "Preparing link...")}
            </button>
          )}
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="rounded-sm px-3 py-2 font-normal text-sm hover:bg-muted">
            Update role
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
                      successMessage: "User role updated",
                    })
                  }
                  type="button"
                >
                  <LoadingMenuLabel loading={pendingAction === `role:${role}`}>
                    {pendingAction === `role:${role}`
                      ? "Updating..."
                      : roleLabel(role)}
                    {currentRole === role ? " (current)" : ""}
                  </LoadingMenuLabel>
                </button>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
