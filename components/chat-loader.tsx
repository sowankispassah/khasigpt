"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import type { IconPromptAction } from "@/lib/icon-prompts";
import type { ChatMessage } from "@/lib/types";
import { cancelIdle, runWhenIdle, shouldPrefetch } from "@/lib/utils/prefetch";
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
  initialHasMoreHistory: boolean;
  initialOldestMessageAt: string | null;
  initialChatModel: string;
  initialChatLanguage: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  autoResume: boolean;
  suggestedPrompts: string[];
  iconPromptActions?: IconPromptAction[];
  imageGeneration: {
    enabled: boolean;
    canGenerate: boolean;
    requiresPaidCredits: boolean;
  };
  documentUploadsEnabled: boolean;
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

  return <ChatClient {...props} />;
}
