"use client";

import { subMonths, subWeeks } from "date-fns";
import { MessageSquareText } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { User } from "next-auth";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWRInfinite from "swr/infinite";
import { useTranslation } from "@/components/language-provider";
import { SidebarSectionLabel } from "@/components/sidebar/sidebar-section-label";
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

export type ChatHistoryMode = "all" | "default" | "study" | "jobs" | "news";

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
      item.mode === "study" ||
      item.mode === "jobs" ||
      item.mode === "news" ||
      item.mode === "default"
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
    mode === "study"
      ? "mode=study&"
      : mode === "jobs"
        ? "mode=jobs&"
        : mode === "news"
          ? "mode=news&"
          : "";
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
      mode === "study"
        ? "mode=study&"
        : mode === "jobs"
          ? "mode=jobs&"
          : mode === "news"
            ? "mode=news&"
            : "";
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

function HistoryGroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2.5 pt-2 pb-1 font-medium text-[11px] text-sidebar-foreground/45">
      {children}
    </div>
  );
}

/** Dashed, muted panel used for the signed-out, empty and error states. */
function HistoryStatePanel({ children }: { children: ReactNode }) {
  return (
    <div className="mx-0.5 flex flex-col items-start gap-2 rounded-lg border border-sidebar-border border-dashed px-3 py-3 text-sidebar-foreground/60 text-xs leading-relaxed">
      <MessageSquareText aria-hidden="true" className="size-4 text-sidebar-foreground/40" />
      {children}
    </div>
  );
}

const HISTORY_RETRY_BUTTON_CLASS =
  "inline-flex h-8 cursor-pointer items-center rounded-lg border border-sidebar-border bg-background px-3 font-medium text-sidebar-foreground text-xs transition hover:bg-sidebar-accent";

export function SidebarHistory({
  user,
  mode = "all",
  label,
  labelKey,
  historyKey,
  showNewsHistory = true,
}: {
  user: User | undefined;
  mode?: ChatHistoryMode;
  label?: string;
  labelKey?: string;
  historyKey?: string;
  showNewsHistory?: boolean;
}) {
  const { setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // A retained layout can keep the previous dynamic segment's params when
  // navigating back to /chat. The URL is the source of truth for highlighting
  // and duplicate-click suppression, including cached route transitions.
  const activePathChatId = pathname.match(/^\/chat\/([^/]+)\/?$/)?.[1] ?? null;
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

      return showNewsHistory
        ? dedupedChats
        : dedupedChats.filter((chat) => chat.mode !== "news");
    },
    [paginatedChatHistories, showNewsHistory]
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
    <SidebarSectionLabel>
      {labelKey ? (
        <EditableTranslation
          defaultText={resolvedLabel}
          translationKey={labelKey}
        />
      ) : (
        resolvedLabel
      )}
    </SidebarSectionLabel>
  ) : null;

  if (!user) {
    return (
      <SidebarGroup className="px-2 py-0">
        {sectionLabel}
        <SidebarGroupContent>
          <HistoryStatePanel>
            <EditableTranslation
              defaultText="Login to save and revisit previous chats!"
              translationKey="sidebar.history.login_prompt"
            />
          </HistoryStatePanel>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (isLoading) {
    return (
      <SidebarGroup className="px-2 py-0">
        {sectionLabel}
        <HistoryGroupLabel>
          <EditableTranslation
            defaultText="Today"
            translationKey="sidebar.history.section.today"
          />
        </HistoryGroupLabel>
        <SidebarGroupContent>
          <div aria-busy="true" className="flex flex-col gap-0.5">
            {[64, 48, 72, 40, 56].map((item) => (
              <div
                className="flex h-9 items-center gap-2.5 rounded-lg px-2.5"
                key={item}
              >
                <div className="size-3.5 shrink-0 animate-pulse rounded bg-sidebar-accent-foreground/10" />
                <div
                  className="h-3 animate-pulse rounded bg-sidebar-accent-foreground/10"
                  style={{ width: `${item}%` }}
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
      <SidebarGroup className="px-2 py-0">
        {sectionLabel}
        <SidebarGroupContent>
          <HistoryStatePanel>
            <span>
              <EditableTranslation
                defaultText="Chat history could not load."
                translationKey="sidebar.history.error"
              />
            </span>
            <button
              className={HISTORY_RETRY_BUTTON_CLASS}
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
          </HistoryStatePanel>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  if (hasEmptyChatHistory && !isHistoryDegraded) {
    return (
      <SidebarGroup className="px-2 py-0">
        {sectionLabel}
        <SidebarGroupContent>
          <HistoryStatePanel>
            <EditableTranslation
              defaultText="Your conversations will appear here once you start chatting!"
              translationKey="sidebar.history.empty"
            />
          </HistoryStatePanel>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <>
      <SidebarGroup className="px-2 py-0">
        {sectionLabel}
        <SidebarGroupContent>
          <SidebarMenu>
            {isHistoryDegraded ? (
              <div className="mx-0.5 mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-800 text-xs dark:text-amber-300">
                <EditableTranslation
                  defaultText="Chat history could not be fully confirmed. Showing the last available items."
                  translationKey="sidebar.history.degraded"
                />
                <button
                  className="mt-1.5 block cursor-pointer font-medium underline underline-offset-2"
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
            <div className="flex flex-col gap-2">
              {groupedChats.today.length > 0 && (
                <div>
                  <HistoryGroupLabel>
                    <EditableTranslation
                      defaultText="Today"
                      translationKey="sidebar.history.section.today"
                    />
                  </HistoryGroupLabel>
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
                  <HistoryGroupLabel>
                    <EditableTranslation
                      defaultText="Yesterday"
                      translationKey="sidebar.history.section.yesterday"
                    />
                  </HistoryGroupLabel>
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
                  <HistoryGroupLabel>
                    <EditableTranslation
                      defaultText="Last 7 days"
                      translationKey="sidebar.history.section.last_week"
                    />
                  </HistoryGroupLabel>
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
                  <HistoryGroupLabel>
                    <EditableTranslation
                      defaultText="Last 30 days"
                      translationKey="sidebar.history.section.last_month"
                    />
                  </HistoryGroupLabel>
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
                  <HistoryGroupLabel>
                    <EditableTranslation
                      defaultText="Older than last month"
                      translationKey="sidebar.history.section.older"
                    />
                  </HistoryGroupLabel>
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
            <div className="mt-3 px-2.5">
              <button
                className={HISTORY_RETRY_BUTTON_CLASS}
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
              <div className="mt-4 px-2.5 text-center text-sidebar-foreground/45 text-xs">
                <EditableTranslation
                  defaultText="You have reached the end of your chat history."
                  translationKey="sidebar.history.end"
                />
              </div>
            )
          ) : (
            <div className="mt-2 flex flex-row items-center gap-2 px-2.5 py-2 text-sidebar-foreground/55 text-xs">
              <div className="animate-spin">
                <LoaderIcon size={12} />
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
