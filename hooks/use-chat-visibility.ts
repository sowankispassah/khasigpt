"use client";

import { useMemo } from "react";
import useSWR, { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { updateChatVisibility } from "@/app/(chat)/actions";
import {
  type ChatHistory,
  type ChatHistoryMode,
  getChatHistoryBaseKey,
  getChatHistoryPaginationKeyForMode,
} from "@/components/sidebar-history";
import type { VisibilityType } from "@/components/visibility-selector";

export function useChatVisibility({
  chatId,
  initialVisibilityType,
  historyKey,
  historyMode = "default",
}: {
  chatId: string;
  initialVisibilityType: VisibilityType;
  historyKey?: string;
  historyMode?: ChatHistoryMode;
}) {
  const { mutate, cache } = useSWRConfig();
  const resolvedHistoryKey = historyKey ?? getChatHistoryBaseKey(historyMode);
  const history: ChatHistory =
    cache.get(resolvedHistoryKey)?.data ?? cache.get("/api/history")?.data;

  const { data: localVisibility, mutate: setLocalVisibility } = useSWR(
    `${chatId}-visibility`,
    null,
    {
      fallbackData: initialVisibilityType,
    }
  );

  const visibilityType = useMemo(() => {
    if (!history) {
      return localVisibility;
    }
    const chat = history.chats.find((currentChat) => currentChat.id === chatId);
    if (!chat) {
      return "private";
    }
    return chat.visibility;
  }, [history, chatId, localVisibility]);

  const setVisibilityType = (updatedVisibilityType: VisibilityType) => {
    setLocalVisibility(updatedVisibilityType);
    mutate(
      unstable_serialize(getChatHistoryPaginationKeyForMode(historyMode))
    );

    updateChatVisibility({
      chatId,
      visibility: updatedVisibilityType,
    });
  };

  return { visibilityType, setVisibilityType };
}
