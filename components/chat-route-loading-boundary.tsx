"use client";

import { usePathname } from "next/navigation";
import { getCachedChatPagePayload } from "@/components/chat-page-cache";
import { ChatLoadingShellDelayed } from "@/components/chat-loading-shell-delayed";
import { ChatPageClient } from "@/components/chat-page-client";

function getChatIdFromPathname(pathname: string | null) {
  if (!pathname || !pathname.startsWith("/chat/")) {
    return null;
  }

  const segments = pathname.split("/").filter(Boolean);
  return segments[1]?.trim() || null;
}

export function ChatRouteLoadingBoundary() {
  const pathname = usePathname();
  const chatId = getChatIdFromPathname(pathname);
  const cachedPayload = chatId ? getCachedChatPagePayload(chatId) : null;

  if (cachedPayload) {
    return <ChatPageClient payload={cachedPayload} />;
  }

  return <ChatLoadingShellDelayed />;
}
