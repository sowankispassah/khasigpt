"use client";

import { useEffect } from "react";
import { preloadChat } from "@/components/chat-loader";

export function ChatPreloader() {
  useEffect(() => {
    let idleId: number | null = null;
    let timeoutId: number | null = null;

    const anyWindow = window as typeof window & {
      requestIdleCallback?: (callback: () => void) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (typeof anyWindow.requestIdleCallback === "function") {
      idleId = anyWindow.requestIdleCallback(() => {
        preloadChat();
      });
    } else {
      timeoutId = window.setTimeout(() => {
        preloadChat();
      }, 200);
    }

    return () => {
      if (idleId !== null && typeof anyWindow.cancelIdleCallback === "function") {
        anyWindow.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  return null;
}
