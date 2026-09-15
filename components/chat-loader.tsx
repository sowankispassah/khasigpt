"use client";

import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ChatPageLoaderPayload } from "@/lib/chat/page-payload";
import { doneGlobalProgress } from "@/lib/ui/global-progress";
import { generateUUID } from "@/lib/utils";

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

// Keep chat split from other routes while letting Next preload its chunk and
// render the greeting/composer in the server response, before hydration.
const ChatClient = dynamic<ChatLoaderProps>(
  () => import("./chat").then((module) => module.Chat),
  { loading: ChatSkeleton }
);

export function preloadChat() {
  if (typeof window !== "undefined") {
    void import("./chat").catch((error) => {
      console.warn("Chat module preload failed", error);
    });
  }
}

export function ChatLoader(props: ChatLoaderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
        : requestedMode === "news"
          ? "news"
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

  useEffect(() => {
    doneGlobalProgress();
  }, []);

  return <ChatClient key={`${activeProps.id}:${activeProps.chatMode}`} {...activeProps} />;
}
