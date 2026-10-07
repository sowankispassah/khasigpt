"use client";

import { formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState, useTransition } from "react";

import {
  deleteChatAction,
  hardDeleteChatAction,
  restoreChatAction,
} from "@/app/(admin)/actions";
import {
  AdminEmptyState,
  AdminNotice,
  AdminPageHeader,
  AdminPanel,
  AdminStatusPill,
} from "@/components/admin/admin-ui";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { Button } from "@/components/ui/button";
import type { ChatListItem } from "@/lib/db/queries";
import { STORAGE_COPY } from "@/lib/uploads/storage-copy";

type Props = {
  initialActiveChats: ChatListItem[];
  initialActiveConfirmed: boolean;
  initialDeletedChats: ChatListItem[];
  initialDeletedConfirmed: boolean;
  initialActiveTotal: number;
  initialActiveTotalConfirmed: boolean;
  initialDeletedTotal: number;
  initialDeletedTotalConfirmed: boolean;
  pageSize?: number;
};

type ChatRow = ChatListItem;

export function AdminChatTables({
  initialActiveChats,
  initialActiveConfirmed,
  initialDeletedChats,
  initialDeletedConfirmed,
  initialActiveTotal,
  initialActiveTotalConfirmed,
  initialDeletedTotal,
  initialDeletedTotalConfirmed,
  pageSize = 10,
}: Props) {
  const [activeChats, setActiveChats] = useState<ChatRow[]>(initialActiveChats);
  const [deletedChats, setDeletedChats] =
    useState<ChatRow[]>(initialDeletedChats);
  const [activeTotal, setActiveTotal] = useState(initialActiveTotal);
  const [deletedTotal, setDeletedTotal] = useState(initialDeletedTotal);
  const [activeTotalConfirmed, setActiveTotalConfirmed] = useState(
    initialActiveTotalConfirmed
  );
  const [deletedTotalConfirmed, setDeletedTotalConfirmed] = useState(
    initialDeletedTotalConfirmed
  );
  const [activeError, setActiveError] = useState(
    initialActiveConfirmed
      ? null
      : "Active chat rows or totals could not be confirmed. Retry this section."
  );
  const [deletedError, setDeletedError] = useState(
    initialDeletedConfirmed
      ? null
      : "Deleted chat rows or totals could not be confirmed. Retry this section."
  );
  const [loadingActive, setLoadingActive] = useState(false);
  const [loadingDeleted, setLoadingDeleted] = useState(false);
  const [hasNextActive, setHasNextActive] = useState(
    activeTotalConfirmed
      ? initialActiveChats.length < initialActiveTotal
      : initialActiveChats.length >= pageSize
  );
  const [hasNextDeleted, setHasNextDeleted] = useState(
    deletedTotalConfirmed
      ? initialDeletedChats.length < initialDeletedTotal
      : initialDeletedChats.length >= pageSize
  );
  const [pageActive, setPageActive] = useState(0);
  const [pageDeleted, setPageDeleted] = useState(0);
  const [pendingAction, setPendingAction] = useState<{
    chatId: string;
    type: "delete" | "restore" | "hard-delete";
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const formatRange = ({
    page,
    rows,
    total,
    totalConfirmed,
  }: {
    page: number;
    rows: ChatRow[];
    total: number;
    totalConfirmed: boolean;
  }) => {
    if (!totalConfirmed) {
      return rows.length > 0
        ? `Showing ${rows.length} rows; total unavailable`
        : "Total unavailable";
    }

    return `Showing ${
      rows.length === 0 ? 0 : page * pageSize + 1
    }-${Math.min((page + 1) * pageSize, total)} of ${total}`;
  };

  const loadPage = async (opts: { deleted: boolean; page: number }) => {
    const setter = opts.deleted ? setDeletedChats : setActiveChats;
    const setHasNext = opts.deleted ? setHasNextDeleted : setHasNextActive;
    const setLoading = opts.deleted ? setLoadingDeleted : setLoadingActive;
    const setPage = opts.deleted ? setPageDeleted : setPageActive;
    const setTotal = opts.deleted ? setDeletedTotal : setActiveTotal;
    const setTotalConfirmed = opts.deleted
      ? setDeletedTotalConfirmed
      : setActiveTotalConfirmed;
    const setError = opts.deleted ? setDeletedError : setActiveError;
    const offset = opts.page * pageSize;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        offset: offset.toString(),
        limit: pageSize.toString(),
        deleted: opts.deleted ? "1" : "0",
      });
      const response = await fetch(`/admin/chats/data?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(body?.message ?? "Failed to load chats");
      }
      const json = (await response.json()) as {
        items: ChatRow[];
        total?: number;
      };
      const items = Array.isArray(json.items) ? json.items : [];
      const total = Number.isFinite(json.total) ? Number(json.total) : items.length;
      setter(items);
      setPage(opts.page);
      setTotal(total);
      setTotalConfirmed(true);
      setHasNext(offset + items.length < total);
    } catch (error) {
      console.error(error);
      setError(
        error instanceof DOMException && error.name === "AbortError"
          ? "Chat rows timed out. Retry this section."
          : error instanceof Error
            ? error.message
            : "Failed to load chats"
      );
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const handleSoftDelete = (chatId: string) => {
    setPendingAction({ chatId, type: "delete" });
    startTransition(async () => {
      try {
        await deleteChatAction({ chatId });
        await Promise.all([
          loadPage({ deleted: false, page: pageActive }),
          loadPage({ deleted: true, page: pageDeleted }),
        ]);
      } finally {
        setPendingAction(null);
      }
    });
  };

  const handleRestore = (chatId: string) => {
    setPendingAction({ chatId, type: "restore" });
    startTransition(async () => {
      try {
        await restoreChatAction({ chatId });
        await Promise.all([
          loadPage({ deleted: false, page: pageActive }),
          loadPage({ deleted: true, page: pageDeleted }),
        ]);
      } finally {
        setPendingAction(null);
      }
    });
  };

  const handleHardDelete = (chatId: string) => {
    setPendingAction({ chatId, type: "hard-delete" });
    startTransition(async () => {
      try {
        await hardDeleteChatAction({ chatId });
        await loadPage({ deleted: true, page: pageDeleted });
      } finally {
        setPendingAction(null);
      }
    });
  };

  const renderPager = ({
    deleted,
    hasNext,
    loading,
    page,
    rows,
    total,
    totalConfirmed,
  }: {
    deleted: boolean;
    hasNext: boolean;
    loading: boolean;
    page: number;
    rows: ChatRow[];
    total: number;
    totalConfirmed: boolean;
  }) => (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
      <span className="text-muted-foreground">
        {formatRange({ page, rows, total, totalConfirmed })}
      </span>
      <div className="flex items-center gap-2">
        <Button
          className="cursor-pointer"
          disabled={page === 0 || loading}
          onClick={() => loadPage({ deleted, page: Math.max(0, page - 1) })}
          size="sm"
          variant="outline"
        >
          Previous
        </Button>
        <span className="px-1 text-muted-foreground text-xs">
          Page {page + 1}
        </span>
        <Button
          className="cursor-pointer"
          disabled={!hasNext || loading}
          onClick={() => loadPage({ deleted, page: page + 1 })}
          size="sm"
          variant="outline"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              Loading...
            </span>
          ) : hasNext ? (
            "Next"
          ) : deleted ? (
            "No more deleted chats"
          ) : (
            "No more chats"
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        description="Review and remove chat threads across the application."
        navHref="/admin/chats"
        title="Chat sessions"
      />

      <AdminPanel
        action={
          activeTotalConfirmed ? (
            <AdminStatusPill>{activeTotal.toLocaleString()}</AdminStatusPill>
          ) : null
        }
        description="Newest conversations first. Open a chat to read it as an admin."
        title="Active chats"
      >
        {activeError ? (
          <div className="border-b px-4 py-3">
            <ChatTableNotice
              message={activeError}
              onRetry={() => loadPage({ deleted: false, page: pageActive })}
            />
          </div>
        ) : null}
        <ChatTable deleted={false}>
          {activeChats.map((chat) => (
            <ChatTableRow chat={chat} deleted={false} key={chat.id}>
              <Button
                className="cursor-pointer"
                disabled={isPending}
                onClick={() => handleSoftDelete(chat.id)}
                size="sm"
                variant="outline"
              >
                {pendingAction?.chatId === chat.id &&
                pendingAction.type === "delete"
                  ? "Deleting..."
                  : "Soft delete"}
              </Button>
            </ChatTableRow>
          ))}
          {activeChats.length === 0 && (
            <tr>
              <td colSpan={5}>
                <AdminEmptyState
                  title={
                    activeError
                      ? "Unable to load active chat sessions."
                      : "No chat sessions found."
                  }
                />
              </td>
            </tr>
          )}
        </ChatTable>
        {renderPager({
          deleted: false,
          hasNext: hasNextActive,
          loading: loadingActive,
          page: pageActive,
          rows: activeChats,
          total: activeTotal,
          totalConfirmed: activeTotalConfirmed,
        })}
      </AdminPanel>

      <AdminPanel
        action={
          deletedTotalConfirmed ? (
            <AdminStatusPill tone="warning">
              {deletedTotal.toLocaleString()}
            </AdminStatusPill>
          ) : null
        }
        description={
          <>
            Soft-deleted chats remain hidden from users. Permanently delete them
            here if they are no longer needed.{" "}
            <EditableTranslation {...STORAGE_COPY.restore} />
          </>
        }
        title="Deleted chats"
      >
        {deletedError ? (
          <div className="border-b px-4 py-3">
            <ChatTableNotice
              message={deletedError}
              onRetry={() => loadPage({ deleted: true, page: pageDeleted })}
            />
          </div>
        ) : null}
        <ChatTable deleted>
          {deletedChats.map((chat) => (
            <ChatTableRow chat={chat} deleted key={chat.id}>
              <Button
                className="cursor-pointer"
                disabled={isPending}
                onClick={() => handleRestore(chat.id)}
                size="sm"
                variant="outline"
              >
                {pendingAction?.chatId === chat.id &&
                pendingAction.type === "restore"
                  ? "Restoring..."
                  : "Restore"}
              </Button>
              <Button
                className="cursor-pointer"
                disabled={isPending}
                onClick={() => handleHardDelete(chat.id)}
                size="sm"
                variant="destructive"
              >
                {pendingAction?.chatId === chat.id &&
                pendingAction.type === "hard-delete"
                  ? "Deleting..."
                  : "Permanent delete"}
              </Button>
            </ChatTableRow>
          ))}
          {deletedChats.length === 0 && (
            <tr>
              <td colSpan={5}>
                <AdminEmptyState
                  title={
                    deletedError
                      ? "Unable to load deleted chats."
                      : "No deleted chats."
                  }
                />
              </td>
            </tr>
          )}
        </ChatTable>
        {renderPager({
          deleted: true,
          hasNext: hasNextDeleted,
          loading: loadingDeleted,
          page: pageDeleted,
          rows: deletedChats,
          total: deletedTotal,
          totalConfirmed: deletedTotalConfirmed,
        })}
      </AdminPanel>
    </div>
  );
}

const absoluteFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
});

function RelativeTime({ value }: { value: Date | string | null }) {
  if (!value) {
    return <span className="text-muted-foreground">—</span>;
  }
  const date = new Date(value);
  return (
    <time
      dateTime={date.toISOString()}
      suppressHydrationWarning
      title={absoluteFormatter.format(date)}
    >
      {formatDistanceToNow(date, { addSuffix: true })}
    </time>
  );
}

function ChatTable({
  children,
  deleted,
}: {
  children: ReactNode;
  deleted: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-muted-foreground text-xs">
          <tr>
            <th className="px-4 py-2.5 text-left font-medium" scope="col">
              Chat
            </th>
            <th className="hidden px-4 py-2.5 text-left font-medium md:table-cell" scope="col">
              Owner
            </th>
            <th className="hidden px-4 py-2.5 text-left font-medium md:table-cell" scope="col">
              Visibility
            </th>
            <th className="hidden px-4 py-2.5 text-left font-medium md:table-cell" scope="col">
              {deleted ? "Deleted" : "Created"}
            </th>
            <th className="px-4 py-2.5 text-right font-medium" scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">{children}</tbody>
      </table>
    </div>
  );
}

function ChatTableRow({
  chat,
  children,
  deleted,
}: {
  chat: ChatRow;
  children: ReactNode;
  deleted: boolean;
}) {
  const timestamp = deleted ? chat.deletedAt : chat.createdAt;
  return (
    <tr className="align-middle transition hover:bg-muted/30">
      <td className="w-full max-w-0 px-4 py-3 md:w-auto md:max-w-[26rem]">
        <Link
          className="block cursor-pointer truncate font-medium text-foreground hover:text-primary hover:underline"
          href={`/chat/${chat.id}?admin=1`}
          title={chat.title || "Untitled chat"}
        >
          {chat.title || "Untitled chat"}
        </Link>
        <div className="mt-0.5 font-mono text-muted-foreground text-xs" title={chat.id}>
          {chat.id.slice(0, 8)}
        </div>
        <div className="mt-0.5 truncate text-muted-foreground text-xs md:hidden">
          {chat.userEmail ?? "Unknown user"} ·{" "}
          <span className="capitalize">{chat.visibility}</span> ·{" "}
          <RelativeTime value={timestamp} />
        </div>
      </td>
      <td className="hidden max-w-[16rem] px-4 py-3 md:table-cell">
        <div className="truncate" title={chat.userEmail ?? undefined}>
          {chat.userEmail ?? "Unknown user"}
        </div>
        <div className="font-mono text-muted-foreground text-xs" title={chat.userId}>
          {chat.userId.slice(0, 8)}
        </div>
      </td>
      <td className="hidden px-4 py-3 md:table-cell">
        <AdminStatusPill
          className="capitalize"
          tone={chat.visibility === "public" ? "info" : "neutral"}
        >
          {chat.visibility}
        </AdminStatusPill>
      </td>
      <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground md:table-cell">
        <RelativeTime value={timestamp} />
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {children}
        </div>
      </td>
    </tr>
  );
}

function ChatTableNotice({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <AdminNotice className="flex flex-wrap items-center justify-between gap-2">
      <span>{message}</span>
      <Button
        className="cursor-pointer"
        onClick={onRetry}
        size="sm"
        type="button"
        variant="outline"
      >
        Retry
      </Button>
    </AdminNotice>
  );
}
