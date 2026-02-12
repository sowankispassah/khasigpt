"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import type { IconPromptAction } from "@/lib/icon-prompts";
import type { LanguageOption } from "@/lib/i18n/languages";
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
  chatMode: "default" | "study";
  languageSettings?: LanguageOption[];
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
    // If a chunk fails to load (deploy mismatch / transient network), don't
    // cache the rejected promise forever. Allow retries.
    chatModulePromise = import("./chat").catch((error) => {
      chatModulePromise = null;
      throw error;
    });
  }
  return chatModulePromise;
}

function resetChatModule() {
  chatModulePromise = null;
}

export function preloadChat() {
  if (typeof window === "undefined") {
    return;
  }
  loadChatModule().catch((error) => {
    console.warn("Chat module preload failed", error);
  });
}

export function ChatLoader(props: ChatLoaderProps) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [ChatClient, setChatClient] = useState<ComponentType<ChatLoaderProps> | null>(
    null
  );

  // Start loading as early as possible (during render), then resolve in an effect.
  useMemo(() => {
    loadChatModule().catch(() => undefined);
  }, [attempt]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);

    loadChatModule()
      .then((module) => {
        if (cancelled) {
          return;
        }
        setChatClient(() => module.Chat);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setChatClient(null);
        setLoadError(error);
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

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

  if (loadError) {
    const message =
      loadError instanceof Error ? loadError.message : "Failed to load chat UI";

    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="max-w-md rounded-lg border bg-card p-5 shadow-sm">
          <div className="font-medium text-base">Chat failed to load</div>
          <div className="mt-2 text-muted-foreground text-sm">
            {message.includes("chunk") || message.includes("ChunkLoadError")
              ? "A new version may have been deployed. Reloading usually fixes this."
              : "Please retry. If it keeps happening, reload the page."}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-3 text-sm hover:bg-muted"
              onClick={() => {
                resetChatModule();
                setAttempt((v) => v + 1);
              }}
              type="button"
            >
              Retry
            </button>
            <button
              className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-3 text-sm hover:bg-muted"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.reload();
                }
              }}
              type="button"
            >
              Reload
            </button>
            <button
              className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-3 text-sm hover:bg-muted"
              onClick={() => {
                router.refresh();
              }}
              type="button"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!ChatClient) {
    return <ChatSkeleton />;
  }

  return <ChatClient {...props} />;
}
