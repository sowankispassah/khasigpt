"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useState } from "react";
import { Messages } from "@/components/messages";
import { ModelSelectorCompact } from "@/components/model-selector-compact";
import { MultimodalInput } from "@/components/multimodal-input";
import { toast } from "@/components/toast";
import type { VisibilityType } from "@/components/visibility-selector";
import { VisibilitySelector } from "@/components/visibility-selector";
import type { JobCard } from "@/lib/jobs/types";
import type { Attachment, ChatMessage } from "@/lib/types";
import { fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import { FloatingChatPopup } from "./floating-chat-popup";

type JobDetailsChatPanelProps = {
  chatId?: string | null;
  defaultOpen?: boolean;
  documentUploadsEnabled: boolean;
  initialHasMoreHistory?: boolean;
  initialChatLanguage: string;
  initialChatModel: string;
  initialMessages?: ChatMessage[];
  initialOldestMessageAt?: string | null;
  initialVisibilityType?: VisibilityType;
  isReadonly?: boolean;
  jobContext: JobCard;
};

export function JobDetailsChatPanel({
  chatId = null,
  defaultOpen = false,
  documentUploadsEnabled,
  initialHasMoreHistory = false,
  initialChatLanguage,
  initialChatModel,
  initialMessages = [],
  initialOldestMessageAt = null,
  initialVisibilityType = "private",
  isReadonly = false,
  jobContext,
}: JobDetailsChatPanelProps) {
  const [resolvedChatId] = useState(() => chatId ?? generateUUID());
  const [isVisible, setIsVisible] = useState(defaultOpen);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [hasMoreHistory, setHasMoreHistory] = useState(initialHasMoreHistory);
  const [oldestMessageAt, setOldestMessageAt] = useState(
    initialOldestMessageAt
  );
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [currentModelId, setCurrentModelId] = useState(initialChatModel);
  const [currentLanguageCode, setCurrentLanguageCode] =
    useState(initialChatLanguage);

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
  } = useChat<ChatMessage>({
    id: resolvedChatId,
    messages: initialMessages,
    experimental_throttle: 100,
    generateId: generateUUID,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      fetch: fetchWithErrorHandlers,
      prepareSendMessagesRequest(request) {
        return {
          body: {
            id: request.id,
            message: request.messages.at(-1),
            selectedChatModel: currentModelId,
            selectedLanguage: currentLanguageCode,
            selectedVisibilityType: initialVisibilityType,
            chatMode: "jobs",
            jobPostingId: jobContext.id,
            originJobPostingId: jobContext.id,
            ...request.body,
          },
        };
      },
    }),
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : String(error ?? "");
      toast({
        type: "error",
        description: message || "Unable to send your message right now.",
      });
    },
  });

  const handleShow = useCallback(() => {
    setIsVisible(true);
  }, []);

  const handleHide = useCallback(() => {
    setIsVisible(false);
  }, []);

  const handleLanguageChange = useCallback((languageCode: string) => {
    const normalized = languageCode.trim().toLowerCase();
    if (!normalized) {
      return;
    }
    setCurrentLanguageCode(normalized);
  }, []);

  useEffect(() => {
    setIsVisible(defaultOpen);
  }, [defaultOpen]);

  useEffect(() => {
    setHasMoreHistory(initialHasMoreHistory);
    setOldestMessageAt(initialOldestMessageAt);
    setIsLoadingHistory(false);
  }, [initialHasMoreHistory, initialOldestMessageAt]);

  const loadOlderMessages = useCallback(async () => {
    if (isLoadingHistory || !hasMoreHistory) {
      return;
    }

    setIsLoadingHistory(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "60");
      if (oldestMessageAt) {
        params.set("before", oldestMessageAt);
      }

      const response = await fetchWithErrorHandlers(
        `/api/chat/${resolvedChatId}/messages?${params.toString()}`
      );
      const data = (await response.json()) as {
        hasMore?: boolean;
        messages?: ChatMessage[];
        oldestMessageAt?: string | null;
      };

      const incomingMessages = Array.isArray(data.messages)
        ? data.messages
        : [];
      if (incomingMessages.length > 0) {
        setMessages((previous) => [...incomingMessages, ...previous]);
      }

      if (typeof data.hasMore === "boolean") {
        setHasMoreHistory(data.hasMore);
      } else {
        setHasMoreHistory(false);
      }

      if ("oldestMessageAt" in data) {
        setOldestMessageAt(
          typeof data.oldestMessageAt === "string" ? data.oldestMessageAt : null
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "");
      toast({
        type: "error",
        description: message || "Unable to load earlier messages.",
      });
    } finally {
      setIsLoadingHistory(false);
    }
  }, [hasMoreHistory, isLoadingHistory, oldestMessageAt, resolvedChatId, setMessages]);

  const emptyState = (
    <div className="rounded-[20px] border border-dashed border-border/60 bg-muted/20 px-5 py-8 text-center text-muted-foreground text-sm">
      Send a message to get started.
    </div>
  );

  return (
    <FloatingChatPopup
      controls={
        isReadonly ? null : (
          <>
            <VisibilitySelector
              chatId={resolvedChatId}
              showOnMobile={true}
              selectedVisibilityType={initialVisibilityType}
            />
            <ModelSelectorCompact
              className="shrink-0"
              onModelChange={setCurrentModelId}
              selectedModelId={currentModelId}
            />
          </>
        )
      }
      isVisible={isVisible}
      onClose={handleHide}
      onOpen={handleShow}
    >
      <div className="min-h-0 flex flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex flex-1 overflow-hidden">
          <Messages
            chatId={resolvedChatId}
            hasMoreHistory={hasMoreHistory}
            header={messages.length === 0 ? emptyState : undefined}
            headerFullWidth={false}
            isArtifactVisible={false}
            isGeneratingImage={false}
            isLoadingHistory={isLoadingHistory}
            isReadonly={isReadonly}
            messages={messages}
            onLoadMoreHistory={loadOlderMessages}
            regenerate={regenerate}
            selectedModelId={currentModelId}
            selectedVisibilityType={initialVisibilityType}
            sendMessage={sendMessage}
            setMessages={setMessages}
            showGreeting={false}
            showScrollbar={true}
            status={status}
            suggestedPrompts={[]}
            votes={[]}
          />
        </div>
        {isReadonly ? null : (
          <div className="shrink-0 border-t border-border/60 bg-background/95 p-3 md:p-4">
            <MultimodalInput
              attachments={attachments}
              autoFocus={isVisible}
              chatId={resolvedChatId}
              documentUploadsEnabled={documentUploadsEnabled}
              imageGenerationCanGenerate={false}
              imageGenerationEnabled={false}
              imageGenerationRequiresPaidCredits={false}
              imageGenerationSelected={false}
              input={input}
              isGeneratingImage={false}
              messages={messages}
              onGenerateImage={() => {}}
              onLanguageChange={handleLanguageChange}
              onModelChange={setCurrentModelId}
              onToggleImageMode={() => {}}
              selectedLanguageCode={currentLanguageCode}
              selectedModelId={currentModelId}
              selectedVisibilityType={initialVisibilityType}
              sendMessage={sendMessage}
              setAttachments={setAttachments}
              setInput={setInput}
              setMessages={setMessages}
              status={status}
              stop={stop}
            />
          </div>
        )}
      </div>
    </FloatingChatPopup>
  );
}
