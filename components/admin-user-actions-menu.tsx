"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { MoreVertical } from "lucide-react";

import { ActionSubmitButton } from "@/components/action-submit-button";
import { SessionUsageChatLink } from "@/components/session-usage-chat-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useFormStatus } from "react-dom";
import { toast } from "./toast";

type AdminUserActionsMenuProps = {
  userId: string;
  isActive: boolean;
  allowPersonalKnowledge: boolean;
  isSelf: boolean;
  onSuspend: (formData: FormData) => Promise<void>;
  onToggleRag: (formData: FormData) => Promise<void>;
  onSetRole: (role: "admin" | "creator" | "regular") => Promise<void>;
  currentRole: "admin" | "creator" | "regular";
};

function CloseAfterSubmit({ onDone }: { onDone: () => void }) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      onDone();
    }
    wasPending.current = pending;
  }, [pending, onDone]);

  return null;
}

export function AdminUserActionsMenu({
  userId,
  isActive,
  allowPersonalKnowledge,
  isSelf,
  onSuspend,
  onToggleRag,
  onSetRole,
  currentRole,
}: AdminUserActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [impersonationLink, setImpersonationLink] = useState<string | null>(null);
  const [impersonateError, setImpersonateError] = useState<string | null>(null);
  const [impersonateLoading, setImpersonateLoading] = useState(false);
  const [impersonatePending, startImpersonate] = useTransition();

  const handleDone = useCallback(() => {
    setOpen(false);
  }, []);

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
    fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
      credentials: "include",
    })
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
            error instanceof Error ? error.message : "Failed to prepare link"
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
    <DropdownMenu open={open} onOpenChange={setOpen}>
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
          <form action={onSuspend} className="w-full">
            <CloseAfterSubmit onDone={handleDone} />
            <ActionSubmitButton
              className="w-full justify-start rounded-sm px-3 py-2 text-sm font-normal hover:bg-muted"
              pendingLabel={isActive ? "Suspending..." : "Restoring..."}
              size="sm"
              variant="ghost"
              disabled={isSelf}
            >
              {isActive ? "Suspend" : "Restore"}
            </ActionSubmitButton>
          </form>
        </DropdownMenuItem>

        <DropdownMenuItem
          className="p-0"
          onSelect={(event) => event.preventDefault()}
        >
          <SessionUsageChatLink
            className="flex w-full items-center rounded-sm px-3 py-2 text-sm font-normal hover:bg-muted hover:text-foreground"
            href={`/admin/users/${userId}/logs`}
          >
            Logs
          </SessionUsageChatLink>
        </DropdownMenuItem>

        <DropdownMenuItem
          className="p-0"
          onSelect={(event) => event.preventDefault()}
        >
          <form action={onToggleRag} className="w-full">
            <CloseAfterSubmit onDone={handleDone} />
            <ActionSubmitButton
              className="w-full justify-start rounded-sm px-3 py-2 text-sm font-normal hover:bg-muted"
              pendingLabel="Updating..."
              size="sm"
              variant="ghost"
              disabled={isSelf}
            >
              {allowPersonalKnowledge ? "Disable RAG" : "Allow RAG"}
            </ActionSubmitButton>
          </form>
        </DropdownMenuItem>

        <DropdownMenuItem className="p-0">
          {impersonationLink ? (
            <a
              className="flex w-full items-center rounded-sm px-3 py-2 text-sm font-normal hover:bg-muted hover:text-foreground"
              href={impersonationLink}
              rel="noreferrer"
              target="_blank"
            >
              Login as user
            </a>
          ) : (
            <button
              className="flex w-full items-center rounded-sm px-3 py-2 text-sm font-normal text-muted-foreground"
              disabled
              type="button"
            >
              {impersonateLoading
                ? "Preparing link..."
                : impersonateError ?? "Preparing link..."}
            </button>
          )}
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="rounded-sm px-3 py-2 text-sm font-normal hover:bg-muted">
            Update role
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            {(["admin", "creator", "regular"] as const).map((role) => (
              <DropdownMenuItem
                key={role}
                className="p-0"
                onSelect={(event) => event.preventDefault()}
              >
                <form
                  action={async () => {
                    await onSetRole(role);
                  }}
                  className="w-full"
                >
                  <CloseAfterSubmit onDone={handleDone} />
                  <ActionSubmitButton
                    className="w-full justify-start rounded-sm px-3 py-1.5 text-sm font-normal hover:bg-muted"
                    pendingLabel="Updating..."
                    size="sm"
                    variant="ghost"
                    disabled={isSelf || currentRole === role}
                  >
                    {role === "admin"
                      ? "Admin"
                      : role === "creator"
                        ? "Creator"
                        : "Regular"}
                    {currentRole === role ? " (current)" : ""}
                  </ActionSubmitButton>
                </form>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
