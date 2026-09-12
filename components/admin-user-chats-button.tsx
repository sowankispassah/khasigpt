"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AdminUserChat = {
  createdAt: string;
  id: string;
  title: string;
};

type AdminUserChatsApiResponse = {
  data?: {
    items?: unknown;
    total?: unknown;
  };
  message?: string;
};

function isAdminUserChat(value: unknown): value is AdminUserChat {
  if (!value || typeof value !== "object") {
    return false;
  }

  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    row.id.length > 0 &&
    typeof row.title === "string" &&
    typeof row.createdAt === "string" &&
    !Number.isNaN(new Date(row.createdAt).getTime())
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

export function AdminUserChatsButton({
  chatCount,
  userId,
}: {
  chatCount: number;
  userId: string;
}) {
  const { translate } = useTranslation();
  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState<AdminUserChat[]>([]);
  const [total, setTotal] = useState(chatCount);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadErrorMessage = translate(
    "admin.users.chats.load_error",
    "Unable to load this user's chats."
  );
  const timeoutErrorMessage = translate(
    "admin.users.chats.timeout",
    "Loading this user's chats timed out."
  );

  async function loadChats() {
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);

    try {
      const params = new URLSearchParams({
        limit: "100",
        userId,
      });
      const response = await fetch(`/api/admin/chats?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as
        | AdminUserChatsApiResponse
        | null;
      if (!response.ok) {
        throw new Error(loadErrorMessage);
      }

      const items = Array.isArray(payload?.data?.items)
        ? payload.data.items.filter(isAdminUserChat)
        : [];
      setChats(items);
      setTotal(
        typeof payload?.data?.total === "number" &&
          Number.isFinite(payload.data.total)
          ? payload.data.total
          : items.length
      );
    } catch (loadError) {
      setError(
        loadError instanceof DOMException && loadError.name === "AbortError"
          ? timeoutErrorMessage
          : loadError instanceof Error
            ? loadError.message
            : loadErrorMessage
      );
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoading(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      void loadChats();
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <Button
        aria-label={translate("admin.users.chats.open", "View user chats")}
        className="cursor-pointer"
        disabled={chatCount === 0 || isLoading}
        onClick={() => handleOpenChange(true)}
        size="sm"
        type="button"
        variant="ghost"
      >
        {isLoading ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          chatCount
        )}
      </Button>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            <EditableTranslation
              defaultText="User chats"
              description="Title for the popup listing chats created by one user."
              translationKey="admin.users.chats.dialog.title"
            />
          </DialogTitle>
          <DialogDescription>
            <EditableTranslation
              defaultText="Select a chat to open it as an administrator."
              description="Helper text for the user chat list popup."
              translationKey="admin.users.chats.dialog.description"
            />
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-muted-foreground text-sm">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            <EditableTranslation
              defaultText="Loading chats..."
              description="Loading state shown while a user's chats are fetched."
              translationKey="admin.users.chats.loading"
            />
          </div>
        ) : error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-sm">
            <span role="alert">{error}</span>
            <Button
              className="cursor-pointer"
              disabled={isLoading}
              onClick={() => void loadChats()}
              size="sm"
              type="button"
              variant="outline"
            >
              <EditableTranslation
                defaultText="Retry"
                description="Button that retries loading a user's chats."
                translationKey="admin.users.chats.retry"
              />
            </Button>
          </div>
        ) : chats.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground text-sm">
            <EditableTranslation
              defaultText="No chats found."
              description="Empty state shown when a user has no active chats."
              translationKey="admin.users.chats.empty"
            />
          </p>
        ) : (
          <div className="grid max-h-[60vh] gap-2 overflow-y-auto">
            {chats.map((chat) => (
              <Link
                className="cursor-pointer rounded-md border px-3 py-3 transition-colors hover:bg-muted/50"
                href={`/chat/${chat.id}?admin=1`}
                key={chat.id}
                onClick={() => setOpen(false)}
              >
                <span className="block font-medium text-sm">
                  {chat.title || (
                    <EditableTranslation
                      defaultText="Untitled chat"
                      description="Fallback title for a chat without a title."
                      translationKey="admin.users.chats.untitled"
                    />
                  )}
                </span>
                <span className="mt-1 block text-muted-foreground text-xs">
                  {formatDateTime(chat.createdAt) ??
                    translate(
                      "admin.users.chats.date_unavailable",
                      "Date unavailable"
                    )}
                </span>
              </Link>
            ))}
            {total > chats.length ? (
              <p className="pt-2 text-muted-foreground text-xs">
                <EditableTranslation
                  defaultText="Showing the first {shown} of {total} chats."
                  description="Notice shown when the chat popup reaches its maximum loaded page size."
                  translationKey="admin.users.chats.showing"
                  values={{ shown: chats.length, total }}
                />
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
