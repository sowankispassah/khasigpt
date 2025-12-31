"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import type { ChatMessage } from "@/lib/types";
import type { VisibilityType } from "./visibility-selector";

const ChatSkeleton = () => (
  <div className="flex h-dvh flex-col gap-4 px-3 py-6 md:px-6">
    <div className="mx-auto flex w-full max-w-4xl flex-1 animate-pulse flex-col gap-4">
      <div className="h-9 w-32 rounded-full bg-muted" />
      <div className="h-48 rounded-2xl bg-muted" />
      <div className="h-6 w-full rounded-full bg-muted/80" />
      <div className="mt-auto flex flex-col gap-2">
        <div className="h-9 rounded-2xl bg-muted" />
        <div className="h-16 rounded-xl border border-muted-foreground/40 border-dashed" />
      </div>
    </div>
  </div>
);

type ChatLoaderProps = {
  id: string;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  autoResume: boolean;
  suggestedPrompts: string[];
  imageGeneration: {
    enabled: boolean;
    canGenerate: boolean;
    requiresPaidCredits: boolean;
  };
  customKnowledgeEnabled: boolean;
};

let chatModulePromise: Promise<typeof import("./chat")> | null = null;

function loadChatModule() {
  if (!chatModulePromise) {
    chatModulePromise = import("./chat");
  }
  return chatModulePromise;
}

export function preloadChat() {
  if (typeof window === "undefined") {
    return;
  }
  loadChatModule().catch((error) => {
    console.warn("Chat module preload failed", error);
  });
}

const ChatClient = dynamic<ChatLoaderProps>(
  () => loadChatModule().then((module) => module.Chat),
  {
    loading: ChatSkeleton,
  }
);

export function ChatLoader(props: ChatLoaderProps) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let idleId: number | null = null;
    let timeoutId: number | null = null;

    const anyWindow = window as typeof window & {
      requestIdleCallback?: (callback: () => void) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const schedulePreload = () => {
      if (typeof anyWindow.requestIdleCallback === "function") {
        idleId = anyWindow.requestIdleCallback(() => {
          preloadChat();
        });
      } else {
        timeoutId = window.setTimeout(() => {
          preloadChat();
        }, 200);
      }
    };

    schedulePreload();

    return () => {
      if (
        idleId !== null &&
        typeof anyWindow.cancelIdleCallback === "function"
      ) {
        anyWindow.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  return <ChatClient {...props} />;
}
