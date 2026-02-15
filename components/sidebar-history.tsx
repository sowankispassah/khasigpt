"use client";

import { isToday, isYesterday, subMonths, subWeeks } from "date-fns";
import { useParams, useRouter } from "next/navigation";
import type { User } from "next-auth";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWRInfinite from "swr/infinite";
import { useTranslation } from "@/components/language-provider";
import { useStudyContextSummary } from "@/hooks/use-study-context";
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
import { cancelIdle, runWhenIdle, shouldPrefetch } from "@/lib/utils/prefetch";
import { preloadChat } from "./chat-loader";
import { LoaderIcon } from "./icons";
import { ChatItem } from "./sidebar-history-item";

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

export type ChatHistoryMode = "default" | "study";

const PAGE_SIZE = 20;
const STUDY_INITIAL_HISTORY_LIMIT = 5;

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

export function getChatHistoryBaseKey(mode: ChatHistoryMode = "default") {
  const modeParam = mode === "study" ? "mode=study&" : "";
  return `/api/history?${modeParam}limit=${PAGE_SIZE}`;
}

export function getChatHistoryPaginationKeyForMode(
  mode: ChatHistoryMode = "default"
) {
  return (pageIndex: number, previousPageData: ChatHistory) => {
    if (previousPageData && previousPageData.hasMore === false) {
      return null;
    }

    if (pageIndex === 0) {
      return getChatHistoryBaseKey(mode);
    }

    const firstChatFromPage = previousPageData.chats.at(-1);

    if (!firstChatFromPage) {
      return null;
    }

    const modeParam = mode === "study" ? "mode=study&" : "";
    return `/api/history?${modeParam}ending_before=${firstChatFromPage.id}&limit=${PAGE_SIZE}`;
  };
}

export function getChatHistoryPaginationKey(
  pageIndex: number,
  previousPageData: ChatHistory
) {
  return getChatHistoryPaginationKeyForMode("default")(
    pageIndex,
    previousPageData
  );
}

export function SidebarHistory({
  user,
  mode = "default",
  label,
  historyKey,
}: {
  user: User | undefined;
  mode?: ChatHistoryMode;
  label?: string;
  historyKey?: string;
}) {
  const { setOpenMobile } = useSidebar();
  const params = useParams();
  const idParam = params?.id;
  const activeChatId =
    typeof idParam === "string"
      ? idParam
      : Array.isArray(idParam)
        ? (idParam[0] ?? null)
        : null;
  const studyContextSummary =
    mode === "study" ? useStudyContextSummary(activeChatId) : null;

  const resolvedHistoryKey = historyKey ?? getChatHistoryBaseKey(mode);
  const historyPaginationKey = useMemo(
    () => getChatHistoryPaginationKeyForMode(mode),
    [mode]
  );

  const {
    data: paginatedChatHistories,
    setSize,
    isValidating,
    isLoading,
    mutate,
  } = useSWRInfinite<ChatHistory>(historyPaginationKey, fetcher, {
    fallbackData: [],
  });

  const router = useRouter();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { translate } = useTranslation();
  const navigatingChatIdRef = useRef<string | null>(null);
  const navigatingResetTimerRef = useRef<number | null>(null);
  const [showAllStudyHistory, setShowAllStudyHistory] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const hasReachedEnd = paginatedChatHistories
    ? paginatedChatHistories.some((page) => page.hasMore === false)
    : false;

  const hasEmptyChatHistory = paginatedChatHistories
    ? paginatedChatHistories.every((page) => page.chats.length === 0)
    : false;
  const chatsFromHistory = useMemo(
    () => {
      if (!paginatedChatHistories) {
        return [];
      }

      const dedupedChats: Chat[] = [];
      const seenChatIds = new Set<string>();

      for (const paginatedChatHistory of paginatedChatHistories) {
        for (const chat of paginatedChatHistory.chats) {
          if (seenChatIds.has(chat.id)) {
            continue;
          }
          seenChatIds.add(chat.id);
          dedupedChats.push(chat);
        }
      }

      dedupedChats.sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();

        if (aTime !== bTime) {
          return bTime - aTime;
        }

        return b.id.localeCompare(a.id);
      });

      return dedupedChats;
    },
    [paginatedChatHistories]
  );
  const visibleChatsFromHistory = useMemo(
    () =>
      mode === "study" && !showAllStudyHistory
        ? chatsFromHistory.slice(0, STUDY_INITIAL_HISTORY_LIMIT)
        : chatsFromHistory,
    [chatsFromHistory, mode, showAllStudyHistory]
  );
  const groupedChats = useMemo(
    () => groupChatsByDate(visibleChatsFromHistory),
    [visibleChatsFromHistory]
  );
  const hasHiddenStudyHistory =
    mode === "study" &&
    !showAllStudyHistory &&
    (chatsFromHistory.length > STUDY_INITIAL_HISTORY_LIMIT || !hasReachedEnd);
  const shouldObserveSentinel =
    mode !== "study" || showAllStudyHistory;

  useEffect(() => {
    if (mode !== "study") {
      return;
    }
    setShowAllStudyHistory(false);
  }, [mode, resolvedHistoryKey]);

  useEffect(() => {
    if (!paginatedChatHistories || paginatedChatHistories.length === 0) {
      return;
    }
    if (!shouldPrefetch()) {
      return;
    }

    const firstPage = paginatedChatHistories[0]?.chats ?? [];
    const initialChats = firstPage.slice(0, 3);
    if (initialChats.length === 0) {
      return;
    }

    const idleHandle = runWhenIdle(() => {
      for (const chat of initialChats) {
        try {
          router.prefetch(`/chat/${chat.id}`);
        } catch (error) {
          console.warn("Prefetch chat failed", error);
        }
      }
      preloadChat();
    });

    return () => {
      cancelIdle(idleHandle);
    };
  }, [paginatedChatHistories, router]);

  useEffect(() => {
    if (!activeChatId) {
      return;
    }
    if (navigatingChatIdRef.current && navigatingChatIdRef.current === activeChatId) {
      if (navigatingResetTimerRef.current !== null) {
        window.clearTimeout(navigatingResetTimerRef.current);
        navigatingResetTimerRef.current = null;
      }
      navigatingChatIdRef.current = null;
      setOpenMobile(false);
    }
  }, [activeChatId, setOpenMobile]);

  useEffect(() => {
    return () => {
      if (navigatingResetTimerRef.current !== null) {
        window.clearTimeout(navigatingResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!shouldObserveSentinel) {
      return;
    }
    const sentinelNode = sentinelRef.current;
    if (!sentinelNode) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !isValidating && !hasReachedEnd) {
            if (navigatingChatIdRef.current) {
              return;
            }
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
  }, [hasReachedEnd, isValidating, setSize, shouldObserveSentinel]);

  const handleOpenChat = (chatId: string) => {
    // Ignore duplicate clicks while a navigation is already in progress.
    if (navigatingChatIdRef.current === chatId) {
      return false;
    }

    if (chatId === activeChatId) {
      setOpenMobile(false);
      return false;
    }

    if (navigatingResetTimerRef.current !== null) {
      window.clearTimeout(navigatingResetTimerRef.current);
      navigatingResetTimerRef.current = null;
    }

    navigatingChatIdRef.current = chatId;
    preloadChat();
    navigatingResetTimerRef.current = window.setTimeout(() => {
      navigatingChatIdRef.current = null;
    }, 12000);

    return true;
  };

  const handlePrefetchChat = (chatId: string) => {
    // Avoid prefetching aggressively when user disables it (data saver etc).
    if (!shouldPrefetch()) {
      return;
    }
    try {
      router.prefetch(`/chat/${chatId}`);
    } catch (error) {
      console.warn("Prefetch chat failed", error);
    }
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
      error: translate("sidebar.history.toast.error", "Failed to delete chat"),
    });

    setShowDeleteDialog(false);

    if (deleteId === activeChatId) {
      router.push("/chat");
    }
  };

  const dynamicStudyLabel =
    mode === "study"
      ? [studyContextSummary?.exam, studyContextSummary?.role, studyContextSummary?.year]
          .map((part) =>
            typeof part === "string" ? part.trim() : `${part ?? ""}`.trim()
          )
          .filter((part) => part.length > 0)
          .join(" / ")
      : null;
  const resolvedLabel = label ?? (dynamicStudyLabel ? dynamicStudyLabel : null);
  const sectionLabel = resolvedLabel ? (
    <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
      {resolvedLabel}
    </div>
  ) : null;

  if (!user) {
    return (
      <SidebarGroup>
        {sectionLabel}
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
        {sectionLabel}
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
        {sectionLabel}
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
      <SidebarGroup>
        {sectionLabel}
        <SidebarGroupContent>
          <SidebarMenu>
            <div className="flex flex-col gap-6">
              {groupedChats.today.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                    {translate("sidebar.history.section.today", "Today")}
                  </div>
                  {groupedChats.today.map((chat) => (
                    <ChatItem
                      chat={chat}
                      historyKey={resolvedHistoryKey}
                      historyMode={mode}
                      isActive={chat.id === activeChatId}
                      key={chat.id}
                      onDelete={(chatId) => {
                        setDeleteId(chatId);
                        setShowDeleteDialog(true);
                      }}
                      onOpen={handleOpenChat}
                      onPrefetch={handlePrefetchChat}
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
                      historyKey={resolvedHistoryKey}
                      historyMode={mode}
                      isActive={chat.id === activeChatId}
                      key={chat.id}
                      onDelete={(chatId) => {
                        setDeleteId(chatId);
                        setShowDeleteDialog(true);
                      }}
                      onOpen={handleOpenChat}
                      onPrefetch={handlePrefetchChat}
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
                      historyKey={resolvedHistoryKey}
                      historyMode={mode}
                      isActive={chat.id === activeChatId}
                      key={chat.id}
                      onDelete={(chatId) => {
                        setDeleteId(chatId);
                        setShowDeleteDialog(true);
                      }}
                      onOpen={handleOpenChat}
                      onPrefetch={handlePrefetchChat}
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
                      historyKey={resolvedHistoryKey}
                      historyMode={mode}
                      isActive={chat.id === activeChatId}
                      key={chat.id}
                      onDelete={(chatId) => {
                        setDeleteId(chatId);
                        setShowDeleteDialog(true);
                      }}
                      onOpen={handleOpenChat}
                      onPrefetch={handlePrefetchChat}
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
                      historyKey={resolvedHistoryKey}
                      historyMode={mode}
                      isActive={chat.id === activeChatId}
                      key={chat.id}
                      onDelete={(chatId) => {
                        setDeleteId(chatId);
                        setShowDeleteDialog(true);
                      }}
                      onOpen={handleOpenChat}
                      onPrefetch={handlePrefetchChat}
                    />
                  ))}
                </div>
              )}
            </div>
          </SidebarMenu>

          {shouldObserveSentinel ? <div aria-hidden ref={sentinelRef} /> : null}

          {hasHiddenStudyHistory ? (
            <div className="mt-4 px-2">
              <button
                className="cursor-pointer rounded-full border border-sidebar-border bg-sidebar-accent/40 px-3 py-1 text-sidebar-foreground text-xs transition hover:bg-sidebar-accent"
                onClick={() => setShowAllStudyHistory(true)}
                type="button"
              >
                {translate("sidebar.history.study.more", "More study history")}
              </button>
            </div>
          ) : hasReachedEnd ? (
            mode === "study" ? null : (
              <div className="mt-8 flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
                {translate(
                  "sidebar.history.end",
                  "You have reached the end of your chat history."
                )}
              </div>
            )
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
