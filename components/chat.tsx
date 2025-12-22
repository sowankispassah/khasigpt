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
import type { Attachment, ChatMessage } from "@/lib/types";
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
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  autoResume,
  suggestedPrompts,
  imageGeneration,
  customKnowledgeEnabled: _customKnowledgeEnabled,
}: {
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
  };
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

  useEffect(() => {
    currentModelIdRef.current = currentModelId;
  }, [currentModelId]);

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
    if (pathname === "/" && newChatNonce) {
      router.replace("/", { scroll: false });
    }
  }, [pathname, newChatNonce, router]);

  const { data: votes } = useSWR<Vote[]>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher
  );

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const isArtifactVisible = false;

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
          isArtifactVisible={isArtifactVisible}
          isGeneratingImage={isGeneratingImage}
          isReadonly={isReadonly}
          messages={messages}
          regenerate={regenerate}
          selectedModelId={currentModelId}
          selectedVisibilityType={visibilityType}
          sendMessage={sendMessage}
          setMessages={setMessages}
          status={status}
          suggestedPrompts={suggestedPrompts}
          votes={votes}
        />

        <div className="sticky bottom-0 z-1 mx-auto flex w-full max-w-4xl gap-2 border-t-0 bg-background px-2 pb-3 md:px-4 md:pb-4">
          {isReadonly ? null : (
            <div className="flex w-full flex-col gap-2">
              <MultimodalInput
                attachments={attachments}
                chatId={id}
                imageGenerationCanGenerate={imageGeneration.canGenerate}
                imageGenerationEnabled={imageGeneration.enabled}
                imageGenerationSelected={isImageMode}
                isGeneratingImage={isGeneratingImage}
                input={input}
                messages={messages}
                onModelChange={setCurrentModelId}
                selectedModelId={currentModelId}
                selectedVisibilityType={visibilityType}
                onGenerateImage={async () => {
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

                  const trimmedPrompt = input.trim();
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

                  const imageAttachment = attachments.find((attachment) =>
                    attachment.contentType?.startsWith("image/")
                  );

                  window.history.replaceState({}, "", `/chat/${id}`);

                  const userMessageId = generateUUID();
                  const userParts = [
                    ...(imageAttachment
                      ? [
                          {
                            type: "file" as const,
                            url: imageAttachment.url,
                            filename: imageAttachment.name,
                            mediaType: imageAttachment.contentType,
                          },
                        ]
                      : []),
                    { type: "text" as const, text: trimmedPrompt },
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
                        userMessageId,
                        imageUrl: imageAttachment?.url ?? null,
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

                    if (!data?.assistantMessage) {
                      toast({
                        type: "error",
                        description: translate(
                          "image.generate.empty",
                          "No image was returned. Try a different prompt."
                        ),
                      });
                      return;
                    }

                    setMessages((prev) => [...prev, data.assistantMessage!]);
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
            <AlertDialogTitle>
              {translate(
                "image.actions.locked.title",
                "Recharge credits to generate images"
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {translate(
                "image.actions.locked.description",
                "Image generation is available for paid plans or users with active credits."
              )}
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
