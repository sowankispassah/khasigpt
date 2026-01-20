"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { ChatHeader } from "@/components/chat-header";
import { useTranslation } from "@/components/language-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAutoResume } from "@/hooks/use-auto-resume";
import { useChatVisibility } from "@/hooks/use-chat-visibility";
import type { Vote } from "@/lib/db/schema";
import type {
  IconPromptAction,
  IconPromptSuggestion,
} from "@/lib/icon-prompts";
import type { Attachment, ChatMessage } from "@/lib/types";
import { CHAT_HISTORY_PAGE_SIZE } from "@/lib/constants";
import { fetcher, fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import { useDataStream } from "./data-stream-provider";
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input";
import { getChatHistoryPaginationKey } from "./sidebar-history";
import { toast } from "./toast";
import type { VisibilityType } from "./visibility-selector";

export function Chat({
  id,
  initialMessages,
  initialHasMoreHistory,
  initialOldestMessageAt,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  autoResume,
  suggestedPrompts,
  iconPromptActions = [],
  imageGeneration,
  documentUploadsEnabled,
  customKnowledgeEnabled: _customKnowledgeEnabled,
}: {
  id: string;
  initialMessages: ChatMessage[];
  initialHasMoreHistory: boolean;
  initialOldestMessageAt: string | null;
  initialChatModel: string;
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
}) {
  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });
  const { translate } = useTranslation();

  const { mutate } = useSWRConfig();
  const { setDataStream } = useDataStream();

  const [input, setInput] = useState<string>("");
  const [showCreditCardAlert, setShowCreditCardAlert] = useState(false);
  const [showRechargeDialog, setShowRechargeDialog] = useState(false);
  const [showImageUpgradeDialog, setShowImageUpgradeDialog] = useState(false);
  const [currentModelId, setCurrentModelId] = useState(initialChatModel);
  const currentModelIdRef = useRef(currentModelId);
  const [isImageMode, setIsImageMode] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [showActionProgress, setShowActionProgress] = useState(false);
  const [actionProgress, setActionProgress] = useState(0);
  const progressTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [hasMoreHistory, setHasMoreHistory] = useState(
    initialHasMoreHistory
  );
  const [oldestMessageAt, setOldestMessageAt] = useState(
    initialOldestMessageAt
  );
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const imageUpgradeTitle = imageGeneration.requiresPaidCredits
    ? translate(
        "image.actions.locked.free.title",
        "Free credits can't be used for images"
      )
    : translate(
        "image.actions.locked.title",
        "Recharge credits to generate images"
      );
  const imageUpgradeDescription = imageGeneration.requiresPaidCredits
    ? translate(
        "image.actions.locked.free.description",
        "You are using free credits. Recharge to generate images."
      )
    : translate(
        "image.actions.locked.description",
        "Image generation is available for paid plans or users with active credits."
      );

  useEffect(() => {
    currentModelIdRef.current = currentModelId;
  }, [currentModelId]);

  useEffect(() => {
    setHasMoreHistory(initialHasMoreHistory);
    setOldestMessageAt(initialOldestMessageAt);
    setIsLoadingHistory(false);
  }, [initialHasMoreHistory, initialOldestMessageAt, id]);

  useEffect(() => {
    if (!imageGeneration.enabled) {
      setIsImageMode(false);
    }
  }, [imageGeneration.enabled]);

  const clearProgressTimers = useCallback(() => {
    for (const timerId of progressTimersRef.current) {
      clearTimeout(timerId);
    }
    progressTimersRef.current = [];
  }, []);

  const startActionProgress = useCallback(() => {
    clearProgressTimers();
    setShowActionProgress(true);
    setActionProgress(12);
    const timers = [
      setTimeout(() => setActionProgress(40), 120),
      setTimeout(() => setActionProgress(70), 260),
      setTimeout(() => setActionProgress(90), 520),
    ];
    progressTimersRef.current = timers;
  }, [clearProgressTimers]);

  useEffect(() => {
    return () => {
      clearProgressTimers();
    };
  }, [clearProgressTimers]);

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    resumeStream,
  } = useChat<ChatMessage>({
    id,
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
            selectedChatModel: currentModelIdRef.current,
            selectedVisibilityType: visibilityType,
            ...request.body,
          },
        };
      },
    }),
    onData: (dataPart) => {
      setDataStream((ds) => (ds ? [...ds, dataPart] : []));
    },
    onFinish: () => {
      mutate(unstable_serialize(getChatHistoryPaginationKey));
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : String(error ?? "");
      const normalized = message.toLowerCase();

      const isCreditError =
        normalized.includes("recharge") || normalized.includes("credit");

      if (isCreditError) {
        setMessages((prev) => {
          if (!prev.length) {
            return prev;
          }
          const next = [...prev];
          const last = next.at(-1);
          if (last?.role === "user") {
            next.pop();
          }
          return next;
        });

        setInput("");
        setAttachments([]);

        if (messages.length <= 1) {
          router.replace("/", { scroll: false });
          if (typeof window !== "undefined") {
            window.history.replaceState({}, "", "/");
          }
        }

        setShowRechargeDialog(true);
        return;
      }

      if (message.includes("AI Gateway requires a valid credit card")) {
        setShowCreditCardAlert(true);
        return;
      }

      if (message.includes("credits") && message.includes("recharge")) {
        setShowRechargeDialog(true);
        return;
      }

      if (message) {
        toast({
          type: "error",
          description: message,
        });
      }
    },
  });

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.get("query");
  const newChatNonce = searchParams.get("new");

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      sendMessage({
        role: "user" as const,
        parts: [{ type: "text", text: query }],
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, "", `/chat/${id}`);
    }
  }, [query, sendMessage, hasAppendedQuery, id]);

  useEffect(() => {
    if ((pathname === "/" || pathname === "/chat") && newChatNonce) {
      const nextPath = pathname === "/chat" ? "/chat" : "/";
      router.replace(nextPath, { scroll: false });
    }
  }, [pathname, newChatNonce, router]);

  const { data: votes } = useSWR<Vote[]>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher
  );

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const isArtifactVisible = false;
  const [iconPromptSuggestions, setIconPromptSuggestions] = useState<
    IconPromptSuggestion[]
  >([]);
  const handleIconPromptSelect = useCallback(
    (item: IconPromptAction) => {
      const trimmedPrompt = item.prompt.trim();
      if (item.showSuggestions && item.suggestions.length > 0) {
        setIconPromptSuggestions(item.suggestions);
      } else {
        setIconPromptSuggestions([]);
        if (trimmedPrompt) {
          setInput((current) => {
            const existing = current ?? "";
            if (item.behavior === "append" && existing.trim().length > 0) {
              const separator = existing.endsWith(" ") ? "" : " ";
              return `${existing}${separator}${trimmedPrompt}`;
            }
            return trimmedPrompt;
          });
        }
      }

      if (item.selectImageMode) {
        if (!imageGeneration.enabled) {
          return;
        }
        if (!imageGeneration.canGenerate) {
          setShowImageUpgradeDialog(true);
          return;
        }
        setIsImageMode(true);
      } else {
        setIsImageMode(false);
      }
    },
    [imageGeneration.canGenerate, imageGeneration.enabled]
  );

  const generateImageFromPrompt = useCallback(
    async (prompt: string, displayPrompt?: string) => {
      if (!imageGeneration.enabled) {
        toast({
          type: "error",
          description: translate(
            "image.disabled",
            "Image generation is currently unavailable."
          ),
        });
        return;
      }
      if (!imageGeneration.canGenerate) {
        setShowImageUpgradeDialog(true);
        return;
      }

      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt) {
        toast({
          type: "error",
          description: translate(
            "image.prompt.required",
            "Add a prompt before generating."
          ),
        });
        return;
      }

      const displayText =
        (displayPrompt ?? "").trim() || trimmedPrompt;
      const imageAttachments = attachments.filter((attachment) =>
        attachment.contentType?.startsWith("image/")
      );

      window.history.replaceState({}, "", `/chat/${id}`);

      const userMessageId = generateUUID();
      const userParts = [
        ...imageAttachments.map((attachment) => ({
          type: "file" as const,
          url: attachment.url,
          filename: attachment.name,
          mediaType: attachment.contentType,
        })),
        { type: "text" as const, text: displayText },
      ];

      setMessages((prev) => [
        ...prev,
        {
          id: userMessageId,
          role: "user",
          parts: userParts,
        },
      ]);

      setInput("");
      setAttachments([]);
      setIsGeneratingImage(true);

      try {
        const response = await fetch("/api/images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: id,
            visibility: visibilityType,
            prompt: trimmedPrompt,
            displayPrompt: displayText,
            userMessageId,
            imageUrls: imageAttachments.map((attachment) => attachment.url),
          }),
        });

        const data = (await response.json().catch(() => null)) as
          | {
              assistantMessage?: ChatMessage;
              message?: string;
            }
          | null;

        if (!response.ok) {
          if (response.status === 402) {
            setMessages((prev) =>
              prev.filter((message) => message.id !== userMessageId)
            );
            setShowImageUpgradeDialog(true);
            return;
          }

          toast({
            type: "error",
            description:
              data?.message ??
              translate(
                "image.generate.failed",
                "Image generation failed. Please try again."
              ),
          });
          return;
        }

        const assistantMessage = data?.assistantMessage;
        if (!assistantMessage) {
          toast({
            type: "error",
            description: translate(
              "image.generate.empty",
              "No image was returned. Try a different prompt."
            ),
          });
          return;
        }

        setMessages((prev) => [...prev, assistantMessage]);
        mutate(unstable_serialize(getChatHistoryPaginationKey));
      } catch (_error) {
        toast({
          type: "error",
          description: translate(
            "image.generate.failed",
            "Image generation failed. Please try again."
          ),
        });
      } finally {
        setIsGeneratingImage(false);
      }
    },
    [
      attachments,
      id,
      imageGeneration.canGenerate,
      imageGeneration.enabled,
      mutate,
      setMessages,
      translate,
      visibilityType,
    ]
  );

  const handleIconPromptSuggestionSelect = useCallback(
    (suggestion: IconPromptSuggestion) => {
      const visibleText = suggestion.label.trim();
      const trimmed = suggestion.prompt.trim();
      const hiddenText = trimmed || visibleText;
      if (!hiddenText) {
        return;
      }
      if ((status !== "ready" && status !== "error") || isGeneratingImage) {
        return;
      }

      setIconPromptSuggestions([]);

      const displayedPrompt = visibleText || hiddenText;
      if (suggestion.isEditable) {
        setInput(displayedPrompt);
        return;
      }

      if (isImageMode) {
        void generateImageFromPrompt(hiddenText, visibleText);
        return;
      }

      window.history.replaceState({}, "", `/chat/${id}`);

      const messageParts = [
        ...attachments.map((attachment) => ({
          type: "file" as const,
          url: attachment.url,
          name: attachment.name,
          mediaType: attachment.contentType,
        })),
        { type: "text" as const, text: displayedPrompt },
      ];

      sendMessage(
        {
          role: "user",
          parts: messageParts,
        },
        hiddenText !== displayedPrompt
          ? { body: { hiddenPrompt: hiddenText } }
          : undefined
      );

      setInput("");
      setAttachments([]);
    },
    [
      attachments,
      generateImageFromPrompt,
      id,
      isGeneratingImage,
      isImageMode,
      sendMessage,
      status,
    ]
  );

  useEffect(() => {
    setIconPromptSuggestions([]);
  }, [id]);

  const loadOlderMessages = useCallback(async () => {
    if (isLoadingHistory || !hasMoreHistory) {
      return;
    }

    setIsLoadingHistory(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(CHAT_HISTORY_PAGE_SIZE));
      if (oldestMessageAt) {
        params.set("before", oldestMessageAt);
      }

      const response = await fetchWithErrorHandlers(
        `/api/chat/${id}/messages?${params.toString()}`
      );
      const data = (await response.json()) as {
        messages?: ChatMessage[];
        hasMore?: boolean;
        oldestMessageAt?: string | null;
      };

      const incomingMessages = Array.isArray(data.messages)
        ? data.messages
        : [];
      if (incomingMessages.length > 0) {
        setMessages((prev) => [...incomingMessages, ...prev]);
      }

      if (typeof data.hasMore === "boolean") {
        setHasMoreHistory(data.hasMore);
      } else {
        setHasMoreHistory(false);
      }

      if (data && "oldestMessageAt" in data) {
        setOldestMessageAt(
          typeof data.oldestMessageAt === "string" ? data.oldestMessageAt : null
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "");
      toast({
        type: "error",
        description:
          message ||
          translate(
            "chat.history.load_failed",
            "Unable to load earlier messages."
          ),
      });
    } finally {
      setIsLoadingHistory(false);
    }
  }, [
    hasMoreHistory,
    id,
    isLoadingHistory,
    oldestMessageAt,
    setMessages,
    translate,
  ]);

  useAutoResume({
    autoResume,
    initialMessages,
    resumeStream,
    setMessages,
  });

  return (
    <>
      {showActionProgress ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-40 h-1 bg-border/50"
        >
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${actionProgress}%` }}
          />
        </div>
      ) : null}
      <div className="overscroll-behavior-contain flex h-dvh min-w-0 touch-pan-y flex-col bg-background">
        <ChatHeader
          chatId={id}
          isReadonly={isReadonly}
          selectedVisibilityType={initialVisibilityType}
        />

        <Messages
          chatId={id}
          hasMoreHistory={hasMoreHistory}
          isArtifactVisible={isArtifactVisible}
          isGeneratingImage={isGeneratingImage}
          isLoadingHistory={isLoadingHistory}
          isReadonly={isReadonly}
          messages={messages}
          onLoadMoreHistory={loadOlderMessages}
          regenerate={regenerate}
          selectedModelId={currentModelId}
          selectedVisibilityType={visibilityType}
          sendMessage={sendMessage}
          setMessages={setMessages}
          status={status}
          suggestedPrompts={suggestedPrompts}
          iconPromptActions={iconPromptActions}
          onIconPromptSelect={handleIconPromptSelect}
          votes={votes}
        />

        <div className="sticky bottom-0 z-1 mx-auto flex w-full max-w-4xl gap-2 border-t-0 bg-background px-2 pb-3 md:px-4 md:pb-4">
          {isReadonly ? null : (
            <div className="flex w-full flex-col gap-2">
              {iconPromptSuggestions.length > 0 ? (
                <div className="rounded-lg bg-background p-2">
                  {iconPromptSuggestions.map((suggestion, index) => (
                    <button
                      className="w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition hover:bg-muted"
                      key={`${suggestion.label}-${index}`}
                      onClick={() => handleIconPromptSuggestionSelect(suggestion)}
                      type="button"
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <MultimodalInput
                attachments={attachments}
                chatId={id}
                documentUploadsEnabled={documentUploadsEnabled}
                imageGenerationCanGenerate={imageGeneration.canGenerate}
                imageGenerationEnabled={imageGeneration.enabled}
                imageGenerationRequiresPaidCredits={
                  imageGeneration.requiresPaidCredits
                }
                imageGenerationSelected={isImageMode}
                isGeneratingImage={isGeneratingImage}
                input={input}
                messages={messages}
                onModelChange={setCurrentModelId}
                selectedModelId={currentModelId}
                selectedVisibilityType={visibilityType}
                onGenerateImage={() => {
                  void generateImageFromPrompt(input);
                }}
                sendMessage={sendMessage}
                setAttachments={setAttachments}
                setInput={setInput}
                setMessages={setMessages}
                status={status}
                stop={stop}
                onToggleImageMode={() => {
                  if (!imageGeneration.enabled) {
                    return;
                  }
                  if (!imageGeneration.canGenerate) {
                    setShowImageUpgradeDialog(true);
                    return;
                  }
                  setIsImageMode((prev) => !prev);
                }}
              />
              <p className="px-2 text-center text-muted-foreground text-xs">
                {translate(
                  "chat.disclaimer.text",
                  "KhasiGPT or other AI Models can make mistakes. Check important details."
                )}{" "}
                <Link className="underline" href="/privacy-policy">
                  {translate(
                    "chat.disclaimer.privacy_link",
                    "See privacy policy."
                  )}
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>

      <AlertDialog
        onOpenChange={setShowRechargeDialog}
        open={showRechargeDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {translate("chat.recharge.alert.title", "Credit top-up required")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {translate(
                "chat.recharge.alert.description",
                "You've used all of your free daily messages. Top up credits to keep chatting without interruptions."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {translate("common.close", "Close")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowRechargeDialog(false);
                router.push("/recharge");
              }}
            >
              {translate("chat.recharge.alert.confirm", "Go to recharge")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={setShowCreditCardAlert}
        open={showCreditCardAlert}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {translate("chat.gateway.alert.title", "Activate AI Gateway")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {translate(
                "chat.gateway.alert.description",
                "This application requires {subject} to activate Vercel AI Gateway."
              ).replace(
                "{subject}",
                process.env.NODE_ENV === "production"
                  ? translate("chat.gateway.alert.subject.owner", "the owner")
                  : translate("chat.gateway.alert.subject.you", "you")
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {translate("common.cancel", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                window.open(
                  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card",
                  "_blank"
                );
                window.location.href = "/";
              }}
            >
              {translate("chat.gateway.alert.confirm", "Activate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={setShowImageUpgradeDialog}
        open={showImageUpgradeDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{imageUpgradeTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {imageUpgradeDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {translate("common.close", "Close")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowImageUpgradeDialog(false);
                startActionProgress();
                router.push("/recharge");
              }}
            >
              {translate("image.actions.locked.cta", "Go to recharge")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
