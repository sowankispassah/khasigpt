"use client";

import { useEffect } from "react";
import { preloadChat } from "@/components/chat-loader";
import { cancelIdle, runWhenIdle, shouldPrefetch } from "@/lib/utils/prefetch";

export function ChatPreloader() {
  useEffect(() => {
    if (!shouldPrefetch()) {
      return;
    }

    const idleHandle = runWhenIdle(() => {
      preloadChat();
    }, 400);

    return () => {
      cancelIdle(idleHandle);
    };
  }, []);

  return null;
}
