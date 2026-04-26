import { useSyncExternalStore } from "react";
import { api } from "@/api/client";
import type { ChatHistoryItem } from "@/api/types";

type ChatHistorySnapshot = {
  chats: ChatHistoryItem[];
  cursorId: string | null;
  error: string | null;
  hasLoaded: boolean;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  ownerId: string | null;
};

const INITIAL_SNAPSHOT: ChatHistorySnapshot = {
  chats: [],
  cursorId: null,
  error: null,
  hasLoaded: false,
  hasMore: false,
  isLoading: false,
  isLoadingMore: false,
  ownerId: null,
};

let snapshot = INITIAL_SNAPSHOT;
let loadPromise: Promise<ChatHistorySnapshot> | null = null;
let loadMorePromise: Promise<ChatHistorySnapshot> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function setSnapshot(update: Partial<ChatHistorySnapshot>) {
  snapshot = {
    ...snapshot,
    ...update,
  };
  emit();
}

function mergeHistory(
  current: ChatHistoryItem[],
  incoming: ChatHistoryItem[]
) {
  const seen = new Set<string>();
  const merged: ChatHistoryItem[] = [];
  for (const item of [...current, ...incoming]) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

export function subscribeToChatHistory(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getChatHistorySnapshot() {
  return snapshot;
}

export function useChatHistorySnapshot() {
  return useSyncExternalStore(
    subscribeToChatHistory,
    getChatHistorySnapshot,
    getChatHistorySnapshot
  );
}

export function setChatHistoryOwner(ownerId: string | null) {
  if (snapshot.ownerId === ownerId) {
    return;
  }

  loadPromise = null;
  loadMorePromise = null;
  snapshot = {
    ...INITIAL_SNAPSHOT,
    ownerId,
  };
  emit();
}

export async function ensureChatHistoryLoaded(options?: { force?: boolean }) {
  const force = options?.force ?? false;
  if (!force && snapshot.hasLoaded) {
    return snapshot;
  }
  if (loadPromise) {
    return loadPromise;
  }

  setSnapshot({
    error: null,
    isLoading: true,
  });

  loadPromise = api
    .chatHistory({
      limit: 20,
      mode: "all",
    })
    .then((result) => {
      const nextChats = result.chats ?? [];
      const lastItem = nextChats[nextChats.length - 1] ?? null;
      setSnapshot({
        chats: nextChats,
        cursorId: lastItem?.id ?? null,
        error: null,
        hasLoaded: true,
        hasMore: Boolean(result.hasMore),
        isLoading: false,
      });
      return snapshot;
    })
    .catch((error) => {
      setSnapshot({
        error:
          error instanceof Error ? error.message : "Unable to load chat history.",
        isLoading: false,
      });
      throw error;
    })
    .finally(() => {
      loadPromise = null;
    });

  return loadPromise;
}

export function refreshChatHistory() {
  return ensureChatHistoryLoaded({ force: true });
}

export async function loadMoreChatHistory() {
  if (
    !snapshot.hasMore ||
    snapshot.isLoadingMore ||
    !snapshot.cursorId ||
    loadMorePromise
  ) {
    return loadMorePromise ?? snapshot;
  }

  setSnapshot({
    error: null,
    isLoadingMore: true,
  });

  loadMorePromise = api
    .chatHistory({
      endingBefore: snapshot.cursorId,
      limit: 20,
      mode: "all",
    })
    .then((result) => {
      const nextChats = result.chats ?? [];
      const lastItem = nextChats[nextChats.length - 1] ?? null;
      setSnapshot({
        chats: mergeHistory(snapshot.chats, nextChats),
        cursorId: lastItem?.id ?? snapshot.cursorId,
        error: null,
        hasLoaded: true,
        hasMore: Boolean(result.hasMore),
        isLoadingMore: false,
      });
      return snapshot;
    })
    .catch((error) => {
      setSnapshot({
        error:
          error instanceof Error ? error.message : "Unable to load chat history.",
        isLoadingMore: false,
      });
      throw error;
    })
    .finally(() => {
      loadMorePromise = null;
    });

  return loadMorePromise;
}

export function patchChatHistoryItem(
  id: string,
  patch: Partial<ChatHistoryItem>
) {
  setSnapshot({
    chats: snapshot.chats.map((chat) =>
      chat.id === id ? { ...chat, ...patch } : chat
    ),
  });
}

export function removeChatHistoryItem(id: string) {
  setSnapshot({
    chats: snapshot.chats.filter((chat) => chat.id !== id),
  });
}
