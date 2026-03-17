"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ComponentType } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatPageLoaderPayload } from "@/lib/chat/page-payload";
import type { LanguageOption } from "@/lib/i18n/languages";
import type { IconPromptAction } from "@/lib/icon-prompts";
import type { JobCard } from "@/lib/jobs/types";
import type { JobListItem } from "@/lib/jobs/types";
import type { ChatMessage } from "@/lib/types";
import { doneGlobalProgress } from "@/lib/ui/global-progress";
import { generateUUID } from "@/lib/utils";
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

export type ChatLoaderProps = ChatPageLoaderPayload;

let resolvedChatClient: ComponentType<ChatLoaderProps> | null = null;
let chatModulePromise: Promise<typeof import("./chat")> | null = null;

function loadChatModule() {
  if (!chatModulePromise) {
    // If a chunk fails to load (deploy mismatch / transient network), don't
    // cache the rejected promise forever. Allow retries.
    chatModulePromise = import("./chat")
      .then((module) => {
        resolvedChatClient = module.Chat;
        return module;
      })
      .catch((error) => {
        chatModulePromise = null;
        resolvedChatClient = null;
        throw error;
      });
  }
  return chatModulePromise;
}

function resetChatModule() {
  chatModulePromise = null;
  resolvedChatClient = null;
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
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [ChatClient, setChatClient] = useState<ComponentType<ChatLoaderProps> | null>(
    () => resolvedChatClient
  );
  const [optimisticSession, setOptimisticSession] = useState<{
    chatMode: ChatLoaderProps["chatMode"];
    id: string;
  } | null>(null);
  const lastOptimisticRouteRef = useRef<string | null>(null);
  const isRootChatShellPath = pathname === "/" || pathname === "/chat";
  const optimisticChatPath = optimisticSession ? `/chat/${optimisticSession.id}` : null;
  const isOptimisticChatPath =
    typeof optimisticChatPath === "string" && pathname === optimisticChatPath;
  const canContinueOptimisticSession =
    isRootChatShellPath || isOptimisticChatPath;

  const requestedMode = searchParams.get("mode");
  const newChatFlag = searchParams.get("new");
  const pendingChatId = searchParams.get("pendingChatId");
  const requestedChatMode =
    requestedMode === "study"
      ? "study"
      : requestedMode === "jobs"
        ? "jobs"
        : "default";

  useEffect(() => {
    if (!canContinueOptimisticSession) {
      lastOptimisticRouteRef.current = null;
      setOptimisticSession(null);
      return;
    }

    if (!isRootChatShellPath || !newChatFlag) {
      return;
    }

    const routeKey = `${pathname}?${searchParams.toString()}`;
    if (lastOptimisticRouteRef.current === routeKey) {
      return;
    }

    lastOptimisticRouteRef.current = routeKey;
    setOptimisticSession({
      chatMode: requestedChatMode,
      id: pendingChatId?.trim() || generateUUID(),
    });
  }, [
    canContinueOptimisticSession,
    isRootChatShellPath,
    newChatFlag,
    pendingChatId,
    pathname,
    requestedChatMode,
    searchParams,
  ]);

  const activeProps = optimisticSession && canContinueOptimisticSession
    ? {
        ...props,
        autoResume: false,
        chatMode: optimisticSession.chatMode,
        id: optimisticSession.id,
        initialHasMoreHistory: false,
        initialJobContext: null,
        initialMessages: [],
        initialOldestMessageAt: null,
      }
    : props;

  // Start loading as early as possible (during render), then resolve in an effect.
  useMemo(() => {
    loadChatModule().catch(() => undefined);
  }, [attempt]);

  useEffect(() => {
    doneGlobalProgress();
  }, [activeProps.chatMode, activeProps.id]);

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

  return <ChatClient key={`${activeProps.id}:${activeProps.chatMode}`} {...activeProps} />;
}
