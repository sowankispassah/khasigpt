"use client";

import { isToday, isYesterday, subMonths, subWeeks } from "date-fns";
import { useParams, useRouter } from "next/navigation";
import type { User } from "next-auth";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import useSWRInfinite from "swr/infinite";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  useSidebar,
} from "@/components/ui/sidebar";
import type { Chat } from "@/lib/db/schema";
import { fetcher } from "@/lib/utils";
import { LoaderIcon } from "./icons";
import { ChatItem } from "./sidebar-history-item";
import { useTranslation } from "@/components/language-provider";
import { preloadChat } from "./chat-loader";

type GroupedChats = {
  today: Chat[];
  yesterday: Chat[];
  lastWeek: Chat[];
  lastMonth: Chat[];
  older: Chat[];
};

export type ChatHistory = {
  chats: Chat[];
  hasMore: boolean;
};

const PAGE_SIZE = 20;

const groupChatsByDate = (chats: Chat[]): GroupedChats => {
  const now = new Date();
  const oneWeekAgo = subWeeks(now, 1);
  const oneMonthAgo = subMonths(now, 1);

  return chats.reduce(
    (groups, chat) => {
      const chatDate = new Date(chat.createdAt);

      if (isToday(chatDate)) {
        groups.today.push(chat);
      } else if (isYesterday(chatDate)) {
        groups.yesterday.push(chat);
      } else if (chatDate > oneWeekAgo) {
        groups.lastWeek.push(chat);
      } else if (chatDate > oneMonthAgo) {
        groups.lastMonth.push(chat);
      } else {
        groups.older.push(chat);
      }

      return groups;
    },
    {
      today: [],
      yesterday: [],
      lastWeek: [],
      lastMonth: [],
      older: [],
    } as GroupedChats
  );
};

export function getChatHistoryPaginationKey(
  pageIndex: number,
  previousPageData: ChatHistory
) {
  if (previousPageData && previousPageData.hasMore === false) {
    return null;
  }

  if (pageIndex === 0) {
    return `/api/history?limit=${PAGE_SIZE}`;
  }

  const firstChatFromPage = previousPageData.chats.at(-1);

  if (!firstChatFromPage) {
    return null;
  }

  return `/api/history?ending_before=${firstChatFromPage.id}&limit=${PAGE_SIZE}`;
}

export function SidebarHistory({ user }: { user: User | undefined }) {
  const { setOpenMobile } = useSidebar();
  const params = useParams();
  const idParam = params?.id;
  const activeChatId =
    typeof idParam === "string"
      ? idParam
      : Array.isArray(idParam)
        ? idParam[0] ?? null
        : null;

  const {
    data: paginatedChatHistories,
    setSize,
    isValidating,
    isLoading,
    mutate,
  } = useSWRInfinite<ChatHistory>(getChatHistoryPaginationKey, fetcher, {
    fallbackData: [],
  });

  const router = useRouter();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { translate } = useTranslation();
  const [navigatingChatId, setNavigatingChatId] = useState<string | null>(null);
  const [isNavigatingToChat, setIsNavigatingToChat] = useState(false);
  const [navProgress, setNavProgress] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const hasReachedEnd = paginatedChatHistories
    ? paginatedChatHistories.some((page) => page.hasMore === false)
    : false;

  const hasEmptyChatHistory = paginatedChatHistories
    ? paginatedChatHistories.every((page) => page.chats.length === 0)
    : false;

  useEffect(() => {
    if (!paginatedChatHistories || paginatedChatHistories.length === 0) {
      return;
    }

    const firstPage = paginatedChatHistories[0]?.chats ?? [];
    for (const chat of firstPage.slice(0, 10)) {
      void router.prefetch(`/chat/${chat.id}`);
    }

    preloadChat();
  }, [paginatedChatHistories, router]);

  useEffect(() => {
    if (!navigatingChatId) {
      return;
    }
    if (navigatingChatId === activeChatId) {
      setNavigatingChatId(null);
      setIsNavigatingToChat(false);
      setNavProgress(0);
      setOpenMobile(false);
    }
  }, [activeChatId, navigatingChatId, setOpenMobile]);

  useEffect(() => {
    if (!isNavigatingToChat) {
      setNavProgress(0);
      return;
    }
    setNavProgress(10);
    const step1 = window.setTimeout(() => setNavProgress(40), 120);
    const step2 = window.setTimeout(() => setNavProgress(70), 260);
    const step3 = window.setTimeout(() => setNavProgress(90), 520);
    return () => {
      window.clearTimeout(step1);
      window.clearTimeout(step2);
      window.clearTimeout(step3);
    };
  }, [isNavigatingToChat]);

  useEffect(() => {
    const sentinelNode = sentinelRef.current;
    if (!sentinelNode) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !isValidating && !hasReachedEnd) {
            setSize((size) => size + 1);
            break;
          }
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinelNode);

    return () => {
      observer.disconnect();
    };
  }, [hasReachedEnd, isValidating, setSize]);

  const handleOpenChat = (chatId: string) => {
    setNavigatingChatId(chatId);
    setIsNavigatingToChat(true);
    preloadChat();
    router.push(`/chat/${chatId}`);
  };

  const handleDelete = () => {
    const deletePromise = fetch(`/api/chat?id=${deleteId}`, {
      method: "DELETE",
    });

    toast.promise(deletePromise, {
      loading: translate("sidebar.history.toast.loading", "Deleting chat..."),
      success: () => {
        mutate((chatHistories) => {
          if (chatHistories) {
            return chatHistories.map((chatHistory) => ({
              ...chatHistory,
              chats: chatHistory.chats.filter((chat) => chat.id !== deleteId),
            }));
          }
        });

        return translate(
          "sidebar.history.toast.success",
          "Chat deleted successfully"
        );
      },
      error: translate(
        "sidebar.history.toast.error",
        "Failed to delete chat"
      ),
    });

    setShowDeleteDialog(false);

    if (deleteId === activeChatId) {
      router.push("/");
    }
  };

  if (!user) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
            {translate(
              "sidebar.history.login_prompt",
              "Login to save and revisit previous chats!"
            )}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (isLoading) {
    return (
      <SidebarGroup>
        <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
          {translate("sidebar.history.section.today", "Today")}
        </div>
        <SidebarGroupContent>
          <div className="flex flex-col">
            {[44, 32, 28, 64, 52].map((item) => (
              <div
                className="flex h-8 items-center gap-2 rounded-md px-2"
                key={item}
              >
                <div
                  className="h-4 max-w-(--skeleton-width) flex-1 rounded-md bg-sidebar-accent-foreground/10"
                  style={
                    {
                      "--skeleton-width": `${item}%`,
                    } as React.CSSProperties
                  }
                />
              </div>
            ))}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (hasEmptyChatHistory) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <div className="flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
            {translate(
              "sidebar.history.empty",
              "Your conversations will appear here once you start chatting!"
            )}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <>
      {isNavigatingToChat ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-40 h-1 bg-border/50"
        >
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${navProgress}%` }}
          />
        </div>
      ) : null}
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {paginatedChatHistories &&
              (() => {
                const chatsFromHistory = paginatedChatHistories.flatMap(
                  (paginatedChatHistory) => paginatedChatHistory.chats
                );

                const groupedChats = groupChatsByDate(chatsFromHistory);

                return (
                  <div className="flex flex-col gap-6">
                    {groupedChats.today.length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                          {translate("sidebar.history.section.today", "Today")}
                        </div>
                        {groupedChats.today.map((chat) => (
                          <ChatItem
                            chat={chat}
                            isActive={chat.id === activeChatId}
                            isNavigating={navigatingChatId === chat.id}
                            key={chat.id}
                            onDelete={(chatId) => {
                              setDeleteId(chatId);
                              setShowDeleteDialog(true);
                            }}
                            onOpen={handleOpenChat}
                          />
                        ))}
                      </div>
                    )}

                    {groupedChats.yesterday.length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                          {translate(
                            "sidebar.history.section.yesterday",
                            "Yesterday"
                          )}
                        </div>
                        {groupedChats.yesterday.map((chat) => (
                          <ChatItem
                            chat={chat}
                            isActive={chat.id === activeChatId}
                            isNavigating={navigatingChatId === chat.id}
                            key={chat.id}
                            onDelete={(chatId) => {
                              setDeleteId(chatId);
                              setShowDeleteDialog(true);
                            }}
                            onOpen={handleOpenChat}
                          />
                        ))}
                      </div>
                    )}

                    {groupedChats.lastWeek.length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                          {translate(
                            "sidebar.history.section.last_week",
                            "Last 7 days"
                          )}
                        </div>
                        {groupedChats.lastWeek.map((chat) => (
                          <ChatItem
                            chat={chat}
                            isActive={chat.id === activeChatId}
                            isNavigating={navigatingChatId === chat.id}
                            key={chat.id}
                            onDelete={(chatId) => {
                              setDeleteId(chatId);
                              setShowDeleteDialog(true);
                            }}
                            onOpen={handleOpenChat}
                          />
                        ))}
                      </div>
                    )}

                    {groupedChats.lastMonth.length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                          {translate(
                            "sidebar.history.section.last_month",
                            "Last 30 days"
                          )}
                        </div>
                        {groupedChats.lastMonth.map((chat) => (
                          <ChatItem
                            chat={chat}
                            isActive={chat.id === activeChatId}
                            isNavigating={navigatingChatId === chat.id}
                            key={chat.id}
                            onDelete={(chatId) => {
                              setDeleteId(chatId);
                              setShowDeleteDialog(true);
                            }}
                            onOpen={handleOpenChat}
                          />
                        ))}
                      </div>
                    )}

                    {groupedChats.older.length > 0 && (
                      <div>
                        <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                          {translate(
                            "sidebar.history.section.older",
                            "Older than last month"
                          )}
                        </div>
                        {groupedChats.older.map((chat) => (
                          <ChatItem
                            chat={chat}
                            isActive={chat.id === activeChatId}
                            isNavigating={navigatingChatId === chat.id}
                            key={chat.id}
                            onDelete={(chatId) => {
                              setDeleteId(chatId);
                              setShowDeleteDialog(true);
                            }}
                            onOpen={handleOpenChat}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
          </SidebarMenu>

          <div aria-hidden ref={sentinelRef} />

          {hasReachedEnd ? (
            <div className="mt-8 flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
              {translate(
                "sidebar.history.end",
                "You have reached the end of your chat history."
              )}
            </div>
          ) : (
            <div className="mt-8 flex flex-row items-center gap-2 p-2 text-zinc-500 dark:text-zinc-400">
              <div className="animate-spin">
                <LoaderIcon />
              </div>
              <div>
                {translate("sidebar.history.loading", "Loading Chats...")}
              </div>
            </div>
          )}
        </SidebarGroupContent>
      </SidebarGroup>

      <AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {translate(
                "sidebar.history.delete_dialog.title",
                "Are you absolutely sure?"
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {translate(
                "sidebar.history.delete_dialog.description",
                "This action cannot be undone. This will permanently delete your chat and remove it from our servers."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {translate("common.cancel", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {translate("sidebar.history.delete_dialog.confirm", "Continue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
