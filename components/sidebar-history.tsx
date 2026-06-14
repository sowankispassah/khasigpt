"use client";

import { subMonths, subWeeks } from "date-fns";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { User } from "next-auth";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWRInfinite from "swr/infinite";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
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
import { useStudyContextSummary } from "@/hooks/use-study-context";
import type { ChatHistoryListItem } from "@/lib/db/queries";
import { cancelIdle, runWhenIdle, shouldPrefetch } from "@/lib/utils/prefetch";
import { preloadChat } from "./chat-loader";
import { deleteCachedChatPagePayload } from "./chat-page-cache";
import { LoaderIcon } from "./icons";
import { ChatItem } from "./sidebar-history-item";

type GroupedChats = {
  today: ChatHistoryListItem[];
  yesterday: ChatHistoryListItem[];
  lastWeek: ChatHistoryListItem[];
  lastMonth: ChatHistoryListItem[];
  older: ChatHistoryListItem[];
};

export type ChatHistory = {
  chats: ChatHistoryListItem[];
  degraded?: boolean;
  degradedSections?: string[];
  hasMore: boolean;
  message?: string;
};

export type ChatHistoryMode = "all" | "default" | "study" | "jobs";

const PAGE_SIZE = 20;
const STUDY_INITIAL_HISTORY_LIMIT = 5;
const CHAT_HISTORY_FETCH_TIMEOUT_MS = 15_000;

class ChatHistoryUnavailableError extends Error {
  constructor(message = "Chat history could not be confirmed.") {
    super(message);
    this.name = "ChatHistoryUnavailableError";
  }
}

function getChatTime(value: unknown) {
  const date = typeof value === "string" || value instanceof Date
    ? new Date(value)
    : null;
  const time = date?.getTime() ?? Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

function normalizeHistoryItem(
  item: ChatHistoryListItem
): ChatHistoryListItem | null {
  if (!item || typeof item.id !== "string" || item.id.trim().length === 0) {
    console.warn("[sidebar-history] Skipping history item with missing id.");
    return null;
  }

  return {
    ...item,
    createdAt: new Date(getChatTime(item.createdAt)),
    mode:
      item.mode === "study" || item.mode === "jobs" || item.mode === "default"
        ? item.mode
        : "default",
    title:
      typeof item.title === "string" && item.title.trim().length > 0
        ? item.title
        : "New Chat",
    updatedAt: new Date(getChatTime(item.updatedAt ?? item.createdAt)),
    visibility: item.visibility === "public" ? "public" : "private",
  };
}

async function chatHistoryFetcher(url: string) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort("chat_history_timeout");
  }, CHAT_HISTORY_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as
      | (ChatHistory & { code?: string })
      | null;
    if (!response.ok) {
      throw new ChatHistoryUnavailableError(
        body?.message ?? `history_fetch_failed:${response.status}`
      );
    }
    if (body?.degraded) {
      throw new ChatHistoryUnavailableError(
        body.message ?? "Chat history could not be confirmed."
      );
    }
    if (!body || !Array.isArray(body.chats)) {
      throw new ChatHistoryUnavailableError("history_payload_invalid");
    }
    return body;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

const groupChatsByDate = (chats: ChatHistoryListItem[]): GroupedChats => {
  const now = new Date();
  const oneWeekAgo = subWeeks(now, 1);
  const oneMonthAgo = subMonths(now, 1);
  const oneDayMs = 24 * 60 * 60 * 1000;

  return chats.reduce(
    (groups, chat) => {
      const chatDate = new Date(getChatTime(chat.createdAt));
      const ageMs = now.getTime() - chatDate.getTime();

      if (ageMs < oneDayMs) {
        groups.today.push(chat);
      } else if (ageMs < oneDayMs * 2) {
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

export function getChatHistoryBaseKey(mode: ChatHistoryMode = "all") {
  const modeParam =
    mode === "study" ? "mode=study&" : mode === "jobs" ? "mode=jobs&" : "";
  return `/api/history?${modeParam}limit=${PAGE_SIZE}`;
}

export function getChatHistoryPaginationKeyForMode(
  mode: ChatHistoryMode = "all"
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

    const modeParam =
      mode === "study" ? "mode=study&" : mode === "jobs" ? "mode=jobs&" : "";
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
  mode = "all",
  label,
  labelKey,
  historyKey,
}: {
  user: User | undefined;
  mode?: ChatHistoryMode;
  label?: string;
  labelKey?: string;
  historyKey?: string;
}) {
  const { setOpenMobile } = useSidebar();
  const params = useParams();
  const searchParams = useSearchParams();
  const idParam = params?.id;
  const activePathChatId =
    typeof idParam === "string"
      ? idParam
      : Array.isArray(idParam)
        ? (idParam[0] ?? null)
        : null;
  const queryChatId = (() => {
    const candidate = searchParams.get("chatId");
    return candidate && candidate.trim().length > 0 ? candidate.trim() : null;
  })();
  const activeChatId = queryChatId ?? activePathChatId;
  const studyContextSummary = useStudyContextSummary(
    mode === "study" ? activeChatId : null
  );

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
    error: historyError,
  } = useSWRInfinite<ChatHistory>(historyPaginationKey, chatHistoryFetcher, {
    errorRetryCount: 0,
    fallbackData: [],
    keepPreviousData: true,
    persistSize: true,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
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
  const isHistoryDegraded = Boolean(
    paginatedChatHistories?.some((page) => page.degraded)
  );
  const chatsFromHistory = useMemo(
    () => {
      if (!paginatedChatHistories) {
        return [];
      }

      const dedupedChats: ChatHistoryListItem[] = [];
      const seenChatIds = new Set<string>();

      for (const paginatedChatHistory of paginatedChatHistories) {
        for (const chat of paginatedChatHistory.chats) {
          const normalizedChat = normalizeHistoryItem(chat);
          if (!normalizedChat || seenChatIds.has(normalizedChat.id)) {
            continue;
          }
          seenChatIds.add(normalizedChat.id);
          dedupedChats.push(normalizedChat);
        }
      }

      dedupedChats.sort((a, b) => {
        const aTime = getChatTime(a.createdAt);
        const bTime = getChatTime(b.createdAt);

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
  }, [mode]);

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
        if (deleteId) {
          deleteCachedChatPagePayload(deleteId);
        }
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
      {labelKey ? (
        <EditableTranslation
          defaultText={resolvedLabel}
          translationKey={labelKey}
        />
      ) : (
        resolvedLabel
      )}
    </div>
  ) : null;

  if (!user) {
    return (
      <SidebarGroup>
        {sectionLabel}
        <SidebarGroupContent>
          <div className="flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
            <EditableTranslation
              defaultText="Login to save and revisit previous chats!"
              translationKey="sidebar.history.login_prompt"
            />
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
          <EditableTranslation
            defaultText="Today"
            translationKey="sidebar.history.section.today"
          />
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

  if ((historyError || isHistoryDegraded) && chatsFromHistory.length === 0) {
    return (
      <SidebarGroup>
        {sectionLabel}
        <SidebarGroupContent>
          <div className="flex flex-col gap-2 px-2 text-sm text-zinc-500">
            <span>
              <EditableTranslation
                defaultText="Chat history could not load."
                translationKey="sidebar.history.error"
              />
            </span>
            <button
              className="w-fit cursor-pointer rounded-md border px-2 py-1 font-medium text-sidebar-foreground text-xs"
              onClick={() => {
                void mutate();
              }}
              type="button"
            >
              <EditableTranslation
                defaultText="Retry"
                translationKey="sidebar.history.retry"
              />
            </button>
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (hasEmptyChatHistory && !isHistoryDegraded) {
    return (
      <SidebarGroup>
        {sectionLabel}
        <SidebarGroupContent>
          <div className="flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
            <EditableTranslation
              defaultText="Your conversations will appear here once you start chatting!"
              translationKey="sidebar.history.empty"
            />
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
            {isHistoryDegraded ? (
              <div className="mb-3 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2 py-2 text-sidebar-foreground/70 text-xs">
                <EditableTranslation
                  defaultText="Chat history could not be fully confirmed. Showing the last available items."
                  translationKey="sidebar.history.degraded"
                />
                <button
                  className="mt-2 block cursor-pointer font-medium text-sidebar-foreground underline underline-offset-2"
                  onClick={() => {
                    void mutate();
                  }}
                  type="button"
                >
                  <EditableTranslation
                    defaultText="Retry"
                    translationKey="sidebar.history.retry"
                  />
                </button>
              </div>
            ) : null}
            <div className="flex flex-col gap-6">
              {groupedChats.today.length > 0 && (
                <div>
                  <div className="px-2 py-1 text-sidebar-foreground/50 text-xs">
                    <EditableTranslation
                      defaultText="Today"
                      translationKey="sidebar.history.section.today"
                    />
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
                    <EditableTranslation
                      defaultText="Yesterday"
                      translationKey="sidebar.history.section.yesterday"
                    />
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
                    <EditableTranslation
                      defaultText="Last 7 days"
                      translationKey="sidebar.history.section.last_week"
                    />
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
                    <EditableTranslation
                      defaultText="Last 30 days"
                      translationKey="sidebar.history.section.last_month"
                    />
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
                    <EditableTranslation
                      defaultText="Older than last month"
                      translationKey="sidebar.history.section.older"
                    />
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
                <EditableTranslation
                  defaultText="More study history"
                  translationKey="sidebar.history.study.more"
                />
              </button>
            </div>
          ) : hasReachedEnd ? (
            mode === "study" ? null : (
              <div className="mt-8 flex w-full flex-row items-center justify-center gap-2 px-2 text-sm text-zinc-500">
                <EditableTranslation
                  defaultText="You have reached the end of your chat history."
                  translationKey="sidebar.history.end"
                />
              </div>
            )
          ) : (
            <div className="mt-8 flex flex-row items-center gap-2 p-2 text-zinc-500 dark:text-zinc-400">
              <div className="animate-spin">
                <LoaderIcon />
              </div>
              <div>
                <EditableTranslation
                  defaultText="Loading Chats..."
                  translationKey="sidebar.history.loading"
                />
              </div>
            </div>
          )}
        </SidebarGroupContent>
      </SidebarGroup>

      <AlertDialog onOpenChange={setShowDeleteDialog} open={showDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <EditableTranslation
                defaultText="Are you absolutely sure?"
                translationKey="sidebar.history.delete_dialog.title"
              />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <EditableTranslation
                defaultText="This action cannot be undone. This will permanently delete your chat and remove it from our servers."
                translationKey="sidebar.history.delete_dialog.description"
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <EditableTranslation defaultText="Cancel" translationKey="common.cancel" />
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              <EditableTranslation
                defaultText="Continue"
                translationKey="sidebar.history.delete_dialog.confirm"
              />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
