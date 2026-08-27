"use client";

import type { CachedChatPagePayload } from "@/lib/chat/page-payload";

const MAX_CACHED_CHAT_PAGE_PAYLOADS = 20;
const chatPagePayloadCache = new Map<string, CachedChatPagePayload>();

export function getCachedChatPagePayload(chatId: string) {
  const cached = chatPagePayloadCache.get(chatId) ?? null;
  if (!cached) {
    return null;
  }

  chatPagePayloadCache.delete(chatId);
  chatPagePayloadCache.set(chatId, cached);
  return cached;
}

export function setCachedChatPagePayload(
  chatId: string,
  payload: CachedChatPagePayload
) {
  chatPagePayloadCache.delete(chatId);
  chatPagePayloadCache.set(chatId, payload);

  while (chatPagePayloadCache.size > MAX_CACHED_CHAT_PAGE_PAYLOADS) {
    const oldestKey = chatPagePayloadCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    chatPagePayloadCache.delete(oldestKey);
  }
}

export function deleteCachedChatPagePayload(chatId: string) {
  chatPagePayloadCache.delete(chatId);
}
