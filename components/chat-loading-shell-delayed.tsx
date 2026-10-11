"use client";

import { useEffect, useState } from "react";
import { ChatLoadingShell } from "@/components/chat-loading-shell";

const CHAT_LOADING_SHELL_DELAY_MS = 180;

export function ChatLoadingShellDelayed() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setIsVisible(true);
    }, CHAT_LOADING_SHELL_DELAY_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, []);

  if (!isVisible) {
    return null;
  }

  return <ChatLoadingShell />;
}
