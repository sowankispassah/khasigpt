"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

  const handleDone = useCallback(() => {
    setOpen(false);
  }, []);

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
            onClick={() => setOpen(false)}
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
