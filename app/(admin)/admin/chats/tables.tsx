"use client";

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useState, useTransition } from "react";

import {
  deleteChatAction,
  hardDeleteChatAction,
  restoreChatAction,
} from "@/app/(admin)/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ChatListItem } from "@/lib/db/queries";

type Props = {
  initialActiveChats: ChatListItem[];
  initialDeletedChats: ChatListItem[];
  initialActiveTotal: number;
  initialDeletedTotal: number;
  pageSize?: number;
};

type ChatRow = ChatListItem;

export function AdminChatTables({
  initialActiveChats,
  initialDeletedChats,
  initialActiveTotal,
  initialDeletedTotal,
  pageSize = 10,
}: Props) {
  const [activeChats, setActiveChats] = useState<ChatRow[]>(initialActiveChats);
  const [deletedChats, setDeletedChats] =
    useState<ChatRow[]>(initialDeletedChats);
  const [activeTotal, setActiveTotal] = useState(initialActiveTotal);
  const [deletedTotal, setDeletedTotal] = useState(initialDeletedTotal);
  const [loadingActive, setLoadingActive] = useState(false);
  const [loadingDeleted, setLoadingDeleted] = useState(false);
  const [hasNextActive, setHasNextActive] = useState(
    initialActiveChats.length < initialActiveTotal
  );
  const [hasNextDeleted, setHasNextDeleted] = useState(
    initialDeletedChats.length < initialDeletedTotal
  );
  const [pageActive, setPageActive] = useState(0);
  const [pageDeleted, setPageDeleted] = useState(0);
  const [pendingAction, setPendingAction] = useState<{
    chatId: string;
    type: "delete" | "restore" | "hard-delete";
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadPage = async (opts: { deleted: boolean; page: number }) => {
    const setter = opts.deleted ? setDeletedChats : setActiveChats;
    const setHasNext = opts.deleted ? setHasNextDeleted : setHasNextActive;
    const setLoading = opts.deleted ? setLoadingDeleted : setLoadingActive;
    const setPage = opts.deleted ? setPageDeleted : setPageActive;
    const setTotal = opts.deleted ? setDeletedTotal : setActiveTotal;
    const offset = opts.page * pageSize;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        offset: offset.toString(),
        limit: pageSize.toString(),
        deleted: opts.deleted ? "1" : "0",
      });
      const response = await fetch(`/admin/chats/data?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Failed to load chats");
      }
      const json = (await response.json()) as { items: ChatRow[]; total?: number };
      const items = Array.isArray(json.items) ? json.items : [];
      const total = Number.isFinite(json.total) ? Number(json.total) : items.length;
      setter(items);
      setPage(opts.page);
      setTotal(total);
      setHasNext(offset + items.length < total);
    } catch (error) {
      console.error(error);
    } finally {
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

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <header>
          <h2 className="font-semibold text-xl">Chat sessions</h2>
          <p className="text-muted-foreground text-sm">
            Review and remove chat threads across the application.
          </p>
        </header>

        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-3 py-3 text-left">Chat</th>
                <th className="px-3 py-3 text-left">Owner</th>
                <th className="px-3 py-3 text-left">Visibility</th>
                <th className="px-3 py-3 text-left">Created</th>
                <th className="px-3 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeChats.map((chat) => (
                <tr className="border-t text-sm" key={chat.id}>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-1">
                      <Link
                        className="cursor-pointer font-medium text-primary text-sm hover:underline"
                        href={`/chat/${chat.id}?admin=1`}
                      >
                        {chat.title || "Untitled chat"}
                      </Link>
                      <span className="font-mono text-muted-foreground text-xs">
                        {chat.id}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <div className="flex flex-col">
                      <span>{chat.userEmail ?? "Unknown user"}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {chat.userId}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 capitalize">{chat.visibility}</td>
                  <td className="px-3 py-3 text-muted-foreground text-xs">
                    {new Date(chat.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-3">
                    <Button
                      disabled={isPending}
                      onClick={() => handleSoftDelete(chat.id)}
                      size="sm"
                      variant="secondary"
                    >
                      {pendingAction?.chatId === chat.id &&
                      pendingAction.type === "delete"
                        ? "Deleting..."
                        : "Soft delete"}
                    </Button>
                  </td>
                </tr>
              ))}
              {activeChats.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-muted-foreground" colSpan={5}>
                    No chat sessions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-3">
          <span className="text-muted-foreground text-xs">
            Showing {activeChats.length === 0 ? 0 : pageActive * pageSize + 1}-
            {Math.min((pageActive + 1) * pageSize, activeTotal)} of {activeTotal}
          </span>
          <span className="text-muted-foreground text-xs">
            Page {pageActive + 1}
          </span>
          <Button
            disabled={pageActive === 0 || loadingActive}
            onClick={() =>
              loadPage({ deleted: false, page: Math.max(0, pageActive - 1) })
            }
            size="sm"
            variant="outline"
          >
            Previous
          </Button>
          <Button
            disabled={!hasNextActive || loadingActive}
            onClick={() => loadPage({ deleted: false, page: pageActive + 1 })}
            size="sm"
            variant="outline"
          >
            {loadingActive
              ? "Loading..."
              : hasNextActive
                ? "Next"
                : "No more chats"}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <header>
          <h3 className="font-semibold text-lg">Deleted chats</h3>
          <p className="text-muted-foreground text-sm">
            Soft-deleted chats remain hidden from users. Permanently delete them
            here if they are no longer needed.
          </p>
        </header>

        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-3 py-3 text-left">Chat</th>
                <th className="px-3 py-3 text-left">Owner</th>
                <th className="px-3 py-3 text-left">Visibility</th>
                <th className="px-3 py-3 text-left">Deleted</th>
                <th className="px-3 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {deletedChats.map((chat) => (
                <tr className="border-t text-sm" key={chat.id}>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Link
                          className="cursor-pointer font-medium text-primary text-sm hover:underline"
                          href={`/chat/${chat.id}?admin=1`}
                        >
                          {chat.title || "Untitled chat"}
                        </Link>
                        <Badge
                          className="border-amber-500 text-amber-600"
                          variant="outline"
                        >
                          Deleted
                        </Badge>
                      </div>
                      <span className="font-mono text-muted-foreground text-xs">
                        {chat.id}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    <div className="flex flex-col">
                      <span>{chat.userEmail ?? "Unknown user"}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {chat.userId}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 capitalize">{chat.visibility}</td>
                  <td className="px-3 py-3 text-muted-foreground text-xs">
                    {chat.deletedAt
                      ? formatDistanceToNow(new Date(chat.deletedAt), {
                          addSuffix: true,
                        })
                      : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                    <Button
                      disabled={isPending}
                      onClick={() => handleRestore(chat.id)}
                      size="sm"
                      variant="secondary"
                    >
                        {pendingAction?.chatId === chat.id &&
                        pendingAction.type === "restore"
                          ? "Restoring..."
                          : "Restore"}
                      </Button>
                      <Button
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
                    </div>
                  </td>
                </tr>
              ))}
              {deletedChats.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-muted-foreground" colSpan={5}>
                    No deleted chats.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-3">
          <span className="text-muted-foreground text-xs">
            Showing {deletedChats.length === 0 ? 0 : pageDeleted * pageSize + 1}-
            {Math.min((pageDeleted + 1) * pageSize, deletedTotal)} of {deletedTotal}
          </span>
          <span className="text-muted-foreground text-xs">
            Page {pageDeleted + 1}
          </span>
          <Button
            disabled={pageDeleted === 0 || loadingDeleted}
            onClick={() =>
              loadPage({ deleted: true, page: Math.max(0, pageDeleted - 1) })
            }
            size="sm"
            variant="outline"
          >
            Previous
          </Button>
          <Button
            disabled={!hasNextDeleted || loadingDeleted}
            onClick={() => loadPage({ deleted: true, page: pageDeleted + 1 })}
            size="sm"
            variant="outline"
          >
            {loadingDeleted
              ? "Loading..."
              : hasNextDeleted
                ? "Next"
                : "No more deleted chats"}
          </Button>
        </div>
      </section>
    </div>
  );
}
