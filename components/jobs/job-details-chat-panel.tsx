"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageSquareText, X } from "lucide-react";
import { useCallback, useState } from "react";
import { Messages } from "@/components/messages";
import { MultimodalInput } from "@/components/multimodal-input";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import type { JobCard } from "@/lib/jobs/types";
import type { Attachment, ChatMessage } from "@/lib/types";
import { cn, fetchWithErrorHandlers, generateUUID } from "@/lib/utils";

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
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
      <div className="w-full px-1 pb-3 sm:px-2 md:px-3 md:pb-4">
        <div className="flex justify-end">
          <div className="relative">
            <div
              aria-hidden={!isVisible}
              className={cn(
                "pointer-events-auto absolute right-0 bottom-11 flex w-[min(33.8rem,calc(100vw-0.5rem))] origin-bottom-right flex-col overflow-hidden rounded-[28px] border border-border/60 bg-background/95 shadow-2xl backdrop-blur transition-all duration-200 ease-out sm:w-[33.8rem]",
                "max-h-[min(82vh,46.8rem)] min-h-[36rem]",
                isVisible
                  ? "translate-y-0 scale-100 opacity-100"
                  : "pointer-events-none translate-y-4 scale-95 opacity-0"
              )}
            >
              <div className="flex items-center justify-between border-border/60 border-b px-4 py-3">
                <div className="font-medium text-sm">Chat</div>
                <Button
                  className="h-8 w-8 cursor-pointer rounded-full border border-border bg-background p-0 shadow-sm hover:bg-muted"
                  onClick={handleHide}
                  size="sm"
                  title="Close chat"
                  type="button"
                  variant="outline"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close chat</span>
                </Button>
              </div>
              <div className="min-h-0 flex-1">
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
                  status={status}
                  suggestedPrompts={[]}
                  votes={[]}
                />
              </div>
              <div className="border-t border-border/60 bg-background/95 p-3 md:p-4">
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
            <div
              className={cn(
                "pointer-events-auto transition-all duration-200 ease-out",
                isVisible
                  ? "translate-y-2 scale-95 opacity-0 pointer-events-none"
                  : "translate-y-0 scale-100 opacity-100"
              )}
            >
              <div className="relative h-0 w-full">
                <Button
                  className="absolute right-0 -top-11 h-8 w-8 cursor-pointer rounded-full border border-border bg-background p-0 shadow-sm hover:bg-muted"
                  onClick={handleShow}
                  size="sm"
                  title="Open chat"
                  type="button"
                  variant="outline"
                >
                  <MessageSquareText className="h-4 w-4" />
                  <span className="sr-only">Open chat</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
