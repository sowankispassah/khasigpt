"use client";

import { useEffect } from "react";
import type { CachedChatPagePayload } from "@/lib/chat/page-payload";
import { setCachedChatPagePayload } from "@/components/chat-page-cache";
import { ChatLoader } from "@/components/chat-loader";
import { ModelConfigProvider } from "@/components/model-config-provider";

export function ChatPageClient({
  payload,
  cacheChatId,
}: {
  payload: CachedChatPagePayload;
  cacheChatId?: string | null;
}) {
  useEffect(() => {
    if (!cacheChatId) {
      return;
    }

    setCachedChatPagePayload(cacheChatId, payload);
  }, [cacheChatId, payload]);

  return (
    <ModelConfigProvider
      defaultModelId={payload.modelConfig.defaultModelId}
      models={payload.modelConfig.models}
    >
      <ChatLoader {...payload.chatLoader} />
    </ModelConfigProvider>
  );
}
