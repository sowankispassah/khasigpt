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

const CHAT_PAGE_SIZE = 5;
type ChatTab = "active" | "deleted";

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

function ChatList({
  chats,
  emptyDefaultText,
  emptyTranslationKey,
  error,
  isLoading,
  onLoadMore,
  onRetry,
  total,
}: {
  chats: AdminUserChat[];
  emptyDefaultText: string;
  emptyTranslationKey: string;
  error: string | null;
  isLoading: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  total: number;
}) {
  const { translate } = useTranslation();

  if (isLoading && chats.length === 0) {
    return (
      <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        <EditableTranslation
          defaultText="Loading chats..."
          description="Loading state shown while a user's chats are fetched."
          translationKey="admin.users.chats.loading"
        />
      </div>
    );
  }

  if (error && chats.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-sm">
        <span role="alert">{error}</span>
        <Button
          className="cursor-pointer"
          onClick={onRetry}
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
    );
  }

  if (chats.length === 0) {
    return (
      <p className="py-6 text-center text-muted-foreground text-sm">
        <EditableTranslation
          defaultText={emptyDefaultText}
          description="Empty state shown for a user's chat section."
          translationKey={emptyTranslationKey}
        />
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      {chats.map((chat) => (
        <Link
          className="cursor-pointer rounded-md border px-3 py-3 transition-colors hover:bg-muted/50"
          href={`/chat/${chat.id}?admin=1`}
          key={chat.id}
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
      {total > 0 ? (
        <p className="pt-2 text-muted-foreground text-xs">
          <EditableTranslation
            defaultText="Showing {shown} of {total} chats."
            description="Count shown below a paginated user chat section."
            translationKey="admin.users.chats.showing"
            values={{ shown: chats.length, total }}
          />
        </p>
      ) : null}
      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-sm">
          <span role="alert">{error}</span>
          <Button
            className="cursor-pointer"
            disabled={isLoading}
            onClick={onRetry}
            size="sm"
            type="button"
            variant="outline"
          >
            {isLoading ? (
              <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            <EditableTranslation
              defaultText="Retry"
              description="Button that retries loading more of a user's chats."
              translationKey="admin.users.chats.retry"
            />
          </Button>
        </div>
      ) : total > chats.length ? (
        <Button
          className="w-full cursor-pointer"
          disabled={isLoading}
          onClick={onLoadMore}
          type="button"
          variant="outline"
        >
          {isLoading ? (
            <>
              <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
              <EditableTranslation
                defaultText="Loading..."
                description="Loading state while more user chats are fetched."
                translationKey="admin.users.chats.loading_more"
              />
            </>
          ) : (
            <EditableTranslation
              defaultText="Load more"
              description="Button that loads the next page of a user's chats."
              translationKey="admin.users.chats.load_more"
            />
          )}
        </Button>
      ) : null}
    </div>
  );
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
  const [selectedTab, setSelectedTab] = useState<ChatTab>("active");
  const [activeChats, setActiveChats] = useState<AdminUserChat[]>([]);
  const [deletedChats, setDeletedChats] = useState<AdminUserChat[]>([]);
  const [activeTotal, setActiveTotal] = useState(0);
  const [deletedTotal, setDeletedTotal] = useState(0);
  const [activePage, setActivePage] = useState(1);
  const [deletedPage, setDeletedPage] = useState(1);
  const [activeLoading, setActiveLoading] = useState(false);
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [activeError, setActiveError] = useState<string | null>(null);
  const [deletedError, setDeletedError] = useState<string | null>(null);
  const loadErrorMessage = translate(
    "admin.users.chats.load_error",
    "Unable to load this user's chats."
  );
  const timeoutErrorMessage = translate(
    "admin.users.chats.timeout",
    "Loading this user's chats timed out."
  );
  const deletedLoadErrorMessage = translate(
    "admin.users.chats.deleted.load_error",
    "Unable to load this user's deleted chats."
  );
  const deletedTimeoutErrorMessage = translate(
    "admin.users.chats.deleted.timeout",
    "Loading this user's deleted chats timed out."
  );
  const isLoading = activeLoading || deletedLoading;

  async function loadChats(deleted: boolean, append = false) {
    if (deleted ? deletedLoading : activeLoading) {
      return;
    }

    const currentPage = deleted ? deletedPage : activePage;
    const requestedPage = append ? currentPage + 1 : 1;
    const setLoading = deleted ? setDeletedLoading : setActiveLoading;
    const setError = deleted ? setDeletedError : setActiveError;
    const setChats = deleted ? setDeletedChats : setActiveChats;
    const setTotal = deleted ? setDeletedTotal : setActiveTotal;
    const setPage = deleted ? setDeletedPage : setActivePage;
    const requestErrorMessage = deleted
      ? deletedLoadErrorMessage
      : loadErrorMessage;
    const requestTimeoutMessage = deleted
      ? deletedTimeoutErrorMessage
      : timeoutErrorMessage;

    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);

    try {
      const params = new URLSearchParams({
        limit: String(CHAT_PAGE_SIZE),
        page: String(requestedPage),
        userId,
      });
      if (deleted) {
        params.set("deleted", "true");
      }
      const response = await fetch(`/api/admin/chats?${params.toString()}`, {
        cache: "no-store",
        credentials: "include",
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as
        | AdminUserChatsApiResponse
        | null;
      if (!response.ok) {
        throw new Error(requestErrorMessage);
      }

      const items = Array.isArray(payload?.data?.items)
        ? payload.data.items.filter(isAdminUserChat)
        : [];
      setChats((current) => {
        if (!append) {
          return items;
        }

        const existingIds = new Set(current.map((chat) => chat.id));
        return [
          ...current,
          ...items.filter((chat) => !existingIds.has(chat.id)),
        ];
      });
      setPage(requestedPage);
      setTotal(
        typeof payload?.data?.total === "number" &&
          Number.isFinite(payload.data.total)
          ? payload.data.total
          : items.length
      );
    } catch (loadError) {
      setError(
        loadError instanceof DOMException && loadError.name === "AbortError"
          ? requestTimeoutMessage
          : loadError instanceof Error
            ? loadError.message
            : requestErrorMessage
      );
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setSelectedTab("active");
      void loadChats(false);
      void loadChats(true);
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

        <div
          aria-label={translate(
            "admin.users.chats.tabs.label",
            "Chat status"
          )}
          className="flex gap-2 border-b pb-3"
          role="tablist"
        >
          <Button
            aria-controls="admin-user-active-chats-panel"
            aria-selected={selectedTab === "active"}
            className="cursor-pointer"
            id="admin-user-active-chats-tab"
            onClick={() => setSelectedTab("active")}
            role="tab"
            type="button"
            variant={selectedTab === "active" ? "default" : "outline"}
          >
            <EditableTranslation
              defaultText="Active chat ({count})"
              description="Tab and count for a user's active chats in the admin popup."
              translationKey="admin.users.chats.active.title"
              values={{ count: activeTotal }}
            />
          </Button>
          <Button
            aria-controls="admin-user-deleted-chats-panel"
            aria-selected={selectedTab === "deleted"}
            className="cursor-pointer"
            id="admin-user-deleted-chats-tab"
            onClick={() => setSelectedTab("deleted")}
            role="tab"
            type="button"
            variant={selectedTab === "deleted" ? "default" : "outline"}
          >
            <EditableTranslation
              defaultText="Deleted chat ({count})"
              description="Tab and count for a user's soft-deleted chats in the admin popup."
              translationKey="admin.users.chats.deleted.title"
              values={{ count: deletedTotal }}
            />
          </Button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto pt-4 pr-1">
          <section
            aria-labelledby="admin-user-active-chats-tab"
            hidden={selectedTab !== "active"}
            id="admin-user-active-chats-panel"
            role="tabpanel"
          >
            <h3 className="sr-only">
              <EditableTranslation
                defaultText="Active chat ({count})"
                description="Heading and count above a user's active chats in the admin popup."
                translationKey="admin.users.chats.active.title"
                values={{ count: activeTotal }}
              />
            </h3>
            <ChatList
              chats={activeChats}
              emptyDefaultText="No active chats found."
              emptyTranslationKey="admin.users.chats.empty"
              error={activeError}
              isLoading={activeLoading}
              onLoadMore={() => void loadChats(false, true)}
              onRetry={() => void loadChats(false, activeChats.length > 0)}
              total={activeTotal}
            />
          </section>

          <section
            aria-labelledby="admin-user-deleted-chats-tab"
            hidden={selectedTab !== "deleted"}
            id="admin-user-deleted-chats-panel"
            role="tabpanel"
          >
            <h3 className="sr-only">
              <EditableTranslation
                defaultText="Deleted chat ({count})"
                description="Heading and count above a user's soft-deleted chats in the admin popup."
                translationKey="admin.users.chats.deleted.title"
                values={{ count: deletedTotal }}
              />
            </h3>
            <ChatList
              chats={deletedChats}
              emptyDefaultText="No deleted chats found."
              emptyTranslationKey="admin.users.chats.deleted.empty"
              error={deletedError}
              isLoading={deletedLoading}
              onLoadMore={() => void loadChats(true, true)}
              onRetry={() => void loadChats(true, deletedChats.length > 0)}
              total={deletedTotal}
            />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
