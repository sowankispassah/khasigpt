import type { ChatMessage } from "@/lib/types";
import { getTextFromMessage } from "@/lib/utils";

export type PendingWebSearch = {
  placeholderId: string;
  userMessageId: string;
  context?: "web" | "news";
};

function hasWebSearchResponseContent(message: ChatMessage) {
  return (
    getTextFromMessage(message).trim().length > 0 ||
    message.parts.some((part) => part.type === "data-webSources")
  );
}

function isTransientWebSearchStatusMessage(message: ChatMessage) {
  if (
    message.role !== "assistant" ||
    hasWebSearchResponseContent(message)
  ) {
    return false;
  }

  const statusParts = message.parts.filter(
    (part) => part.type === "data-webSearchStatus"
  );
  return (
    statusParts.length > 0 &&
    statusParts.every((part) => part.data.status !== "failed")
  );
}

/**
 * Removes temporary search-status messages only after an assistant response
 * exists for the same user request. Failed statuses are retained for retry UI.
 */
export function clearTransientWebSearchMessages(
  messages: ChatMessage[],
  pendingWebSearch: PendingWebSearch
) {
  const userIndex = messages.findIndex(
    (entry) => entry.id === pendingWebSearch.userMessageId
  );
  if (userIndex === -1) {
    return messages;
  }

  const responseExists = messages
    .slice(userIndex + 1)
    .some(
      (entry) =>
        entry.id !== pendingWebSearch.placeholderId &&
        entry.role === "assistant" &&
        hasWebSearchResponseContent(entry)
    );
  if (!responseExists) {
    return messages;
  }

  const transientIds = new Set(
    messages
      .slice(userIndex + 1)
      .filter(isTransientWebSearchStatusMessage)
      .map((entry) => entry.id)
  );
  transientIds.add(pendingWebSearch.placeholderId);

  const nextMessages = messages.filter((entry) => !transientIds.has(entry.id));
  return nextMessages.length === messages.length ? messages : nextMessages;
}
