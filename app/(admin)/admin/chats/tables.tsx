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
  pageSize?: number;
};

type ChatRow = ChatListItem;

export function AdminChatTables({
  initialActiveChats,
  initialDeletedChats,
  pageSize = 10,
}: Props) {
  const [activeChats, setActiveChats] =
    useState<ChatRow[]>(initialActiveChats);
  const [deletedChats, setDeletedChats] =
    useState<ChatRow[]>(initialDeletedChats);
  const [loadingActive, setLoadingActive] = useState(false);
  const [loadingDeleted, setLoadingDeleted] = useState(false);
  const [hasNextActive, setHasNextActive] = useState(
    initialActiveChats.length === pageSize
  );
  const [hasNextDeleted, setHasNextDeleted] = useState(
    initialDeletedChats.length === pageSize
  );
  const [pageActive, setPageActive] = useState(0);
  const [pageDeleted, setPageDeleted] = useState(0);
  const [isPending, startTransition] = useTransition();

  const loadPage = async (opts: { deleted: boolean; page: number }) => {
    const setter = opts.deleted ? setDeletedChats : setActiveChats;
    const setHasNext = opts.deleted ? setHasNextDeleted : setHasNextActive;
    const setLoading = opts.deleted ? setLoadingDeleted : setLoadingActive;
    const setPage = opts.deleted ? setPageDeleted : setPageActive;
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
      const json = (await response.json()) as { items: ChatRow[] };
      const items = Array.isArray(json.items) ? json.items : [];
      setter(items);
      setPage(opts.page);
      setHasNext(items.length === pageSize);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSoftDelete = (chatId: string) => {
    startTransition(async () => {
      await deleteChatAction({ chatId });
      await loadPage({ deleted: false, page: pageActive });
    });
  };

  const handleRestore = (chatId: string) => {
    startTransition(async () => {
      await restoreChatAction({ chatId });
      await loadPage({ deleted: true, page: pageDeleted });
    });
  };

  const handleHardDelete = (chatId: string) => {
    startTransition(async () => {
      await hardDeleteChatAction({ chatId });
      await loadPage({ deleted: true, page: pageDeleted });
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
                <th className="py-3 px-3 text-left">Chat</th>
                <th className="py-3 px-3 text-left">Owner</th>
                <th className="py-3 px-3 text-left">Visibility</th>
                <th className="py-3 px-3 text-left">Created</th>
                <th className="py-3 px-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeChats.map((chat) => (
                <tr className="border-t text-sm" key={chat.id}>
                  <td className="py-3 px-3">
                    <div className="flex flex-col gap-1">
                      <Link
                        className="font-medium text-primary text-sm hover:underline"
                        href={`/chat/${chat.id}?admin=1`}
                      >
                        {chat.title || "Untitled chat"}
                      </Link>
                      <span className="font-mono text-muted-foreground text-xs">
                        {chat.id}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-xs">
                    <div className="flex flex-col">
                      <span>{chat.userEmail ?? "Unknown user"}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {chat.userId}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-3 capitalize">{chat.visibility}</td>
                  <td className="py-3 px-3 text-muted-foreground text-xs">
                    {new Date(chat.createdAt).toLocaleString()}
                  </td>
                  <td className="py-3 px-3">
                    <Button
                      disabled={isPending}
                      onClick={() => handleSoftDelete(chat.id)}
                      size="sm"
                      variant="secondary"
                    >
                      Soft delete
                    </Button>
                  </td>
                </tr>
              ))}
              {activeChats.length === 0 && (
                <tr>
                  <td className="py-6 px-3 text-muted-foreground" colSpan={5}>
                    No chat sessions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-3">
          <span className="text-xs text-muted-foreground">
            Page {pageActive + 1}
          </span>
          <Button
            disabled={pageActive === 0 || loadingActive}
            onClick={() => loadPage({ deleted: false, page: Math.max(0, pageActive - 1) })}
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
                <th className="py-3 px-3 text-left">Chat</th>
                <th className="py-3 px-3 text-left">Owner</th>
                <th className="py-3 px-3 text-left">Visibility</th>
                <th className="py-3 px-3 text-left">Deleted</th>
                <th className="py-3 px-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {deletedChats.map((chat) => (
                <tr className="border-t text-sm" key={chat.id}>
                  <td className="py-3 px-3">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Link
                          className="font-medium text-primary text-sm hover:underline"
                          href={`/chat/${chat.id}?admin=1`}
                        >
                          {chat.title || "Untitled chat"}
                        </Link>
                        <Badge variant="outline" className="border-amber-500 text-amber-600">
                          Deleted
                        </Badge>
                      </div>
                      <span className="font-mono text-muted-foreground text-xs">
                        {chat.id}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-xs">
                    <div className="flex flex-col">
                      <span>{chat.userEmail ?? "Unknown user"}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {chat.userId}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-3 capitalize">{chat.visibility}</td>
                  <td className="py-3 px-3 text-muted-foreground text-xs">
                    {chat.deletedAt
                      ? formatDistanceToNow(new Date(chat.deletedAt), {
                          addSuffix: true,
                        })
                      : "—"}
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        disabled={isPending}
                        onClick={() => handleRestore(chat.id)}
                        size="sm"
                        variant="secondary"
                      >
                        Restore
                      </Button>
                      <Button
                        disabled={isPending}
                        onClick={() => handleHardDelete(chat.id)}
                        size="sm"
                        variant="destructive"
                      >
                        Permanent delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {deletedChats.length === 0 && (
                <tr>
                  <td className="py-6 px-3 text-muted-foreground" colSpan={5}>
                    No deleted chats.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-3">
          <span className="text-xs text-muted-foreground">
            Page {pageDeleted + 1}
          </span>
          <Button
            disabled={pageDeleted === 0 || loadingDeleted}
            onClick={() => loadPage({ deleted: true, page: Math.max(0, pageDeleted - 1) })}
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
