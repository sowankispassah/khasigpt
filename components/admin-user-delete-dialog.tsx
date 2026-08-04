"use client";

import { useEffect, useState, useTransition } from "react";
import { LoaderIcon } from "@/components/icons";
import { useTranslation } from "@/components/language-provider";
import { toast } from "@/components/toast";
import { EditableTranslation } from "@/components/translation-edit-provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchWithTimeout } from "@/lib/utils/async";

type DeleteMode = "permanent" | "soft";

type AdminUserDeleteDialogProps = {
  email: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  userId: string;
};

const USER_DELETE_TIMEOUT_MS = 25_000;

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function readDeleteError(response: Response) {
  const data = await response.json().catch(() => null);
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return "Unable to delete user.";
}

export function AdminUserDeleteDialog({
  email,
  onOpenChange,
  open,
  userId,
}: AdminUserDeleteDialogProps) {
  const { translate } = useTranslation();
  const [mode, setMode] = useState<DeleteMode>("soft");
  const [permanentConfirmed, setPermanentConfirmed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();

  useEffect(() => {
    if (open) {
      setMode("soft");
      setPermanentConfirmed(false);
    }
  }, [open]);

  const isBusy = isDeleting || isRefreshing;
  const canDelete = mode === "soft" || permanentConfirmed;

  async function handleDelete() {
    if (isBusy || !canDelete) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetchWithTimeout(
        `/api/admin/users/${userId}`,
        {
          body: JSON.stringify({
            confirmation:
              mode === "permanent" ? "PERMANENT_DELETE" : undefined,
            mode,
          }),
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          method: "DELETE",
        },
        USER_DELETE_TIMEOUT_MS
      );

      if (!response.ok) {
        throw new Error(await readDeleteError(response));
      }

      toast({
        description: translate(
          mode === "soft"
            ? "admin.users.delete.success.soft"
            : "admin.users.delete.success.permanent",
          mode === "soft"
            ? "User soft-deleted. The account is now suspended."
            : "User permanently deleted."
        ),
        type: "success",
      });
      onOpenChange(false);
      startRefresh(() => {
        window.location.reload();
      });
    } catch (error) {
      toast({
        description: isAbortError(error)
          ? translate(
              "admin.users.delete.timeout",
              "User deletion timed out. Refresh the list before retrying."
            )
          : error instanceof Error
            ? error.message
            : translate(
                "admin.users.delete.error",
                "Unable to delete user. Please retry."
              ),
        type: "error",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!isBusy) {
          onOpenChange(nextOpen);
        }
      }}
      open={open}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <EditableTranslation
              defaultText="Delete user"
              description="Title for the admin user deletion confirmation dialog."
              translationKey="admin.users.delete.title"
            />
          </DialogTitle>
          <DialogDescription>
            <EditableTranslation
              defaultText="Choose how to delete {email}."
              description="Instruction above the soft and permanent admin user deletion choices."
              translationKey="admin.users.delete.description"
              values={{ email }}
            />
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <button
            aria-pressed={mode === "soft"}
            className={`cursor-pointer rounded-md border p-4 text-left transition-colors ${
              mode === "soft"
                ? "border-primary bg-primary/5"
                : "border-input hover:bg-muted/50"
            }`}
            disabled={isBusy}
            onClick={() => setMode("soft")}
            type="button"
          >
            <span className="block font-medium text-sm">
              <EditableTranslation
                defaultText="Soft delete"
                description="Admin user deletion option that keeps the account data and marks it inactive."
                translationKey="admin.users.delete.soft.title"
              />
            </span>
            <span className="mt-1 block text-muted-foreground text-sm">
              <EditableTranslation
                defaultText="Suspend the account and keep its data. An admin can restore it later."
                description="Explanation of the admin soft-delete option."
                translationKey="admin.users.delete.soft.description"
              />
            </span>
          </button>

          <button
            aria-pressed={mode === "permanent"}
            className={`cursor-pointer rounded-md border p-4 text-left transition-colors ${
              mode === "permanent"
                ? "border-destructive bg-destructive/5"
                : "border-input hover:bg-muted/50"
            }`}
            disabled={isBusy}
            onClick={() => {
              setMode("permanent");
              setPermanentConfirmed(false);
            }}
            type="button"
          >
            <span className="block font-medium text-destructive text-sm">
              <EditableTranslation
                defaultText="Permanent delete"
                description="Admin user deletion option that permanently removes the account and its associated data."
                translationKey="admin.users.delete.permanent.title"
              />
            </span>
            <span className="mt-1 block text-muted-foreground text-sm">
              <EditableTranslation
                defaultText="Permanently remove the account and associated data. This cannot be undone."
                description="Warning for the admin permanent user deletion option."
                translationKey="admin.users.delete.permanent.description"
              />
            </span>
          </button>
        </div>

        {mode === "permanent" ? (
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              checked={permanentConfirmed}
              className="mt-1 cursor-pointer"
              disabled={isBusy}
              onChange={(event) => setPermanentConfirmed(event.target.checked)}
              type="checkbox"
            />
            <span>
              <EditableTranslation
                defaultText="I understand that permanent deletion cannot be undone."
                description="Required acknowledgement before an admin can permanently delete a user."
                translationKey="admin.users.delete.permanent.acknowledgement"
              />
            </span>
          </label>
        ) : null}

        <DialogFooter>
          <button
            className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-4 py-2 font-medium text-sm hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
            disabled={isBusy}
            onClick={() => onOpenChange(false)}
            type="button"
          >
            <EditableTranslation
              defaultText="Cancel"
              description="Cancel button in the admin user deletion dialog."
              translationKey="admin.users.delete.cancel"
            />
          </button>
          <button
            className={`inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 font-medium text-sm disabled:pointer-events-none disabled:opacity-50 ${
              mode === "permanent"
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
            disabled={isBusy || !canDelete}
            onClick={handleDelete}
            type="button"
          >
            {isDeleting ? (
              <>
                <span className="h-4 w-4 animate-spin">
                  <LoaderIcon size={16} />
                </span>
                <EditableTranslation
                  defaultText="Deleting..."
                  description="Button label shown while an admin user deletion is in progress."
                  translationKey="admin.users.delete.pending"
                />
              </>
            ) : (
              <EditableTranslation
                defaultText={
                  mode === "permanent" ? "Delete permanently" : "Soft delete user"
                }
                description="Confirmation button for the selected admin user deletion mode."
                translationKey={
                  mode === "permanent"
                    ? "admin.users.delete.permanent.confirm"
                    : "admin.users.delete.soft.confirm"
                }
              />
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
