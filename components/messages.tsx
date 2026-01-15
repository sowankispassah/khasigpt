import type { UseChatHelpers } from "@ai-sdk/react";
import { ArrowDownIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@/components/language-provider";
import { useMessages } from "@/hooks/use-messages";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { Conversation, ConversationContent } from "./elements/conversation";
import { Greeting } from "./greeting";
import { LoaderIcon } from "./icons";
import { PreviewMessage } from "./message";
import { SuggestedActions } from "./suggested-actions";
import type { VisibilityType } from "./visibility-selector";

type MessagesProps = {
  chatId: string;
  status: UseChatHelpers<ChatMessage>["status"];
  votes: Vote[] | undefined;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  isArtifactVisible: boolean;
  selectedModelId: string;
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  suggestedPrompts: string[];
  selectedVisibilityType: VisibilityType;
  isGeneratingImage?: boolean;
  hasMoreHistory?: boolean;
  isLoadingHistory?: boolean;
  onLoadMoreHistory?: () => Promise<void>;
};

const MAX_RENDERED_MESSAGES = 200;

function PureMessages({
  chatId,
  status,
  votes,
  messages,
  setMessages,
  regenerate,
  isReadonly,
  selectedModelId: _selectedModelId,
  sendMessage,
  suggestedPrompts,
  selectedVisibilityType,
  isGeneratingImage = false,
  hasMoreHistory = false,
  isLoadingHistory = false,
  onLoadMoreHistory,
}: MessagesProps) {
  const lastMessage = messages.at(-1);
  const isLastUserMessage = lastMessage?.role === "user";
  const votesByMessageId = useMemo(() => {
    if (!votes) {
      return null;
    }
    const map = new Map<string, Vote>();
    for (const vote of votes) {
      map.set(vote.messageId, vote);
    }
    return map;
  }, [votes]);
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    isAtBottom,
    scrollToBottom,
    hasSentMessage,
  } = useMessages({
    status,
  });
  const { translate } = useTranslation();
  const [showAllLoaded, setShowAllLoaded] = useState(false);
  const mountedChatRef = useRef<string | null>(null);
  const isFetchingHistoryRef = useRef(false);
  const hiddenCount = showAllLoaded
    ? 0
    : Math.max(0, messages.length - MAX_RENDERED_MESSAGES);
  const baseIndex = showAllLoaded ? 0 : hiddenCount;
  const visibleMessages = showAllLoaded ? messages : messages.slice(hiddenCount);
  const streamingSignature =
    status === "streaming" && lastMessage?.role === "assistant"
      ? (lastMessage.parts
          ?.map((part) => {
            if (part.type === "text") {
              return `text-${part.text?.length ?? 0}`;
            }
            if ("toolCallId" in part && part.toolCallId) {
              return `${part.type}-${part.toolCallId}`;
            }
            return part.type;
          })
          .join("|") ?? "")
      : null;

  useEffect(() => {
    if (status !== "ready" && status !== "streaming" && status !== "error") {
      requestAnimationFrame(() => {
        const container = messagesContainerRef.current;
        if (container) {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: "smooth",
          });
        }
      });
    }
  }, [status, messagesContainerRef]);

  useEffect(() => {
    if (mountedChatRef.current !== chatId) {
      mountedChatRef.current = chatId;
      setShowAllLoaded(false);
      if (messages.length > 0) {
        requestAnimationFrame(() => {
          scrollToBottom("auto");
        });
      }
    }
  }, [chatId, messages.length, scrollToBottom]);

  useEffect(() => {
    if (status === "streaming" && streamingSignature !== null && isAtBottom) {
      requestAnimationFrame(() => {
        scrollToBottom("auto");
      });
    }
  }, [status, streamingSignature, isAtBottom, scrollToBottom]);

  useEffect(() => {
    if (!isGeneratingImage) {
      return;
    }
    requestAnimationFrame(() => {
      scrollToBottom("auto");
    });
  }, [isGeneratingImage, scrollToBottom]);

  const handleLoadMore = useCallback(async () => {
    if (!onLoadMoreHistory || isLoadingHistory || isFetchingHistoryRef.current) {
      return;
    }
    isFetchingHistoryRef.current = true;
    const container = messagesContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    const prevScrollTop = container?.scrollTop ?? 0;
    try {
      await onLoadMoreHistory();
      setShowAllLoaded(true);
    } finally {
      requestAnimationFrame(() => {
        const nextScrollHeight = container?.scrollHeight ?? 0;
        if (container) {
          container.scrollTop =
            prevScrollTop + (nextScrollHeight - prevScrollHeight);
        }
        isFetchingHistoryRef.current = false;
      });
    }
  }, [isLoadingHistory, messagesContainerRef, onLoadMoreHistory]);

  if (messages.length === 0) {
    return (
      <div
        className="overscroll-behavior-contain -webkit-overflow-scrolling-touch flex-1 touch-pan-y overflow-y-scroll"
        ref={messagesContainerRef}
        style={{ overflowAnchor: "none" }}
      >
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-1 flex-col px-2 py-6 md:px-4">
          <div className="flex flex-1 items-center justify-center">
            <Greeting />
          </div>
          <div className="mt-10 w-full max-w-3xl self-center">
            <SuggestedActions
              chatId={chatId}
              prompts={suggestedPrompts}
              selectedVisibilityType={selectedVisibilityType}
              sendMessage={sendMessage}
            />
          </div>
          <div className="h-0" ref={messagesEndRef} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="overscroll-behavior-contain -webkit-overflow-scrolling-touch flex-1 touch-pan-y overflow-y-scroll"
      ref={messagesContainerRef}
      style={{ overflowAnchor: "none" }}
    >
      <Conversation className="mx-auto flex min-w-0 max-w-4xl flex-col gap-4 md:gap-6">
        <ConversationContent className="flex flex-col gap-4 px-2 py-4 md:gap-6 md:px-4">
          {hasMoreHistory && onLoadMoreHistory ? (
            <div className="flex justify-center">
              <button
                className="cursor-pointer rounded-full border border-border bg-background px-4 py-2 text-xs text-muted-foreground transition hover:bg-muted disabled:cursor-default disabled:opacity-60"
                disabled={isLoadingHistory}
                onClick={handleLoadMore}
                type="button"
              >
                {isLoadingHistory
                  ? translate(
                      "chat.history.loading",
                      "Loading earlier messages..."
                    )
                  : translate(
                      "chat.history.load_more",
                      "Load earlier messages"
                    )}
              </button>
            </div>
          ) : null}

          {hiddenCount > 0 ? (
            <div className="flex justify-center">
              <button
                className="cursor-pointer text-xs text-muted-foreground underline-offset-4 transition hover:underline"
                onClick={() => setShowAllLoaded(true)}
                type="button"
              >
                {translate(
                  "chat.history.show_older",
                  "Show {count} earlier messages"
                ).replace("{count}", String(hiddenCount))}
              </button>
            </div>
          ) : null}

          {visibleMessages.map((message, index) => {
            const originalIndex = baseIndex + index;
            return (
            <PreviewMessage
              chatId={chatId}
              isLoading={
                status === "streaming" && messages.length - 1 === originalIndex
              }
              isReadonly={isReadonly}
              key={message.id}
              message={message}
              regenerate={regenerate}
              requiresScrollPadding={
                hasSentMessage && originalIndex === messages.length - 1
              }
              setMessages={setMessages}
              vote={votesByMessageId?.get(message.id)}
            />
            );
          })}

          {isGeneratingImage && (
            <div className="flex w-full items-start justify-start gap-2 md:gap-3">
              <div className="flex flex-col gap-2">
                <div className="relative h-60 w-60 overflow-hidden rounded-xl border bg-muted/60">
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 animate-pulse bg-muted/70"
                  />
                  <div className="relative z-10 flex h-full w-full items-center justify-center">
                    <div className="flex items-center gap-2 rounded-full bg-background/85 px-3 py-1 text-muted-foreground text-xs shadow-sm">
                      <span className="inline-flex size-4 animate-spin items-center justify-center">
                        <LoaderIcon size={14} />
                      </span>
                      {translate("image.generate.loading", "Generating...")}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {status !== "ready" &&
            status !== "streaming" &&
            status !== "error" &&
            isLastUserMessage && (
              <div className="flex w-full items-start justify-start gap-2 md:gap-3">
                <div className="min-w-[1.5rem]" />
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex size-4 animate-spin items-center justify-center text-muted-foreground">
                      <LoaderIcon size={14} />
                    </span>
                  </div>
                </div>
              </div>
            )}

          <div
            className="min-h-[24px] min-w-[24px] shrink-0"
            ref={messagesEndRef}
          />
        </ConversationContent>
      </Conversation>

      {!isAtBottom && (
        <button
          aria-label="Scroll to bottom"
          className="-translate-x-1/2 absolute bottom-40 left-1/2 z-10 rounded-full border bg-background p-2 shadow-lg transition-colors hover:bg-muted"
          onClick={() => scrollToBottom("smooth")}
          type="button"
        >
          <ArrowDownIcon className="size-4" />
        </button>
      )}
    </div>
  );
}

export const Messages = memo(PureMessages);
