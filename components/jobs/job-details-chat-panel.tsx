"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useState } from "react";
import { Messages } from "@/components/messages";
import { MultimodalInput } from "@/components/multimodal-input";
import { toast } from "@/components/toast";
import type { JobCard } from "@/lib/jobs/types";
import type { Attachment, ChatMessage } from "@/lib/types";
import { fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import { FloatingChatPopup } from "./floating-chat-popup";

type JobDetailsChatPanelProps = {
  documentUploadsEnabled: boolean;
  initialChatLanguage: string;
  initialChatModel: string;
  jobContext: JobCard;
};

export function JobDetailsChatPanel({
  documentUploadsEnabled,
  initialChatLanguage,
  initialChatModel,
  jobContext,
}: JobDetailsChatPanelProps) {
  const [chatId] = useState(() => generateUUID());
  const [isVisible, setIsVisible] = useState(false);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
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
    id: chatId,
    messages: [],
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
            selectedVisibilityType: "private",
            chatMode: "jobs",
            jobPostingId: jobContext.id,
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

  const emptyState = (
    <div className="rounded-[20px] border border-dashed border-border/60 bg-muted/20 px-5 py-8 text-center text-muted-foreground text-sm">
      Send a message to get started.
    </div>
  );

  return (
    <FloatingChatPopup
      isVisible={isVisible}
      onClose={handleHide}
      onOpen={handleShow}
    >
      <div className="min-h-0 flex flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex flex-1 overflow-hidden">
          <Messages
            chatId={chatId}
            hasMoreHistory={false}
            header={messages.length === 0 ? emptyState : undefined}
            headerFullWidth={false}
            isArtifactVisible={false}
            isGeneratingImage={false}
            isLoadingHistory={false}
            isReadonly={false}
            messages={messages}
            regenerate={regenerate}
            selectedModelId={currentModelId}
            selectedVisibilityType="private"
            sendMessage={sendMessage}
            setMessages={setMessages}
            showGreeting={false}
            showScrollbar={true}
            status={status}
            suggestedPrompts={[]}
            votes={[]}
          />
        </div>
        <div className="shrink-0 border-t border-border/60 bg-background/95 p-3 md:p-4">
          <MultimodalInput
            attachments={attachments}
            chatId={chatId}
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
            selectedVisibilityType="private"
            sendMessage={sendMessage}
            setAttachments={setAttachments}
            setInput={setInput}
            setMessages={setMessages}
            status={status}
            stop={stop}
          />
        </div>
      </div>
    </FloatingChatPopup>
  );
}
