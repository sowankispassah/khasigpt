"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { Trigger } from "@radix-ui/react-select";
import type { UIMessage } from "ai";
import equal from "fast-deep-equal";
import { Mic } from "lucide-react";
import {
  type ChangeEvent,
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useWindowSize } from "usehooks-ts";
import { useTranslation } from "@/components/language-provider";
import { useModelConfig } from "@/components/model-config-provider";
import {
  EditableTranslation,
  useEditableTranslation,
} from "@/components/translation-edit-provider";
import { SelectItem } from "@/components/ui/select";
import type { JobTitleReference } from "@/lib/jobs/types";
import type { StudyQuestionReference } from "@/lib/study/types";
import type { Attachment, ChatMessage } from "@/lib/types";
import { getAttachmentAcceptValue } from "@/lib/uploads/document-uploads";
import { cn } from "@/lib/utils";
import {
  startWebGeminiVoiceTurn,
  type WebGeminiVoiceTurnController,
  type WebGeminiVoiceTurnStatus,
} from "@/lib/voice/web-live-voice";
import {
  PromptInput,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from "./elements/prompt-input";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  CrossSmallIcon,
  GlobeIcon,
  ImageIcon,
  MessageIcon,
  PaperclipIcon,
  StopIcon,
} from "./icons";
import { PreviewAttachment } from "./preview-attachment";
import { Button } from "./ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import type { VisibilityType } from "./visibility-selector";

function PureMultimodalInput({
  chatId: _chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages: _messages,
  setMessages,
  sendMessage,
  className,
  selectedVisibilityType: _selectedVisibilityType,
  selectedLanguageCode,
  onLanguageChange,
  imageGenerationEnabled,
  imageGenerationSelected,
  imageGenerationCanGenerate,
  imageGenerationRequiresPaidCredits,
  isGeneratingImage,
  jobTitleReference,
  lockJobTitleReference = false,
  onClearJobTitleReference,
  studyQuestionReference,
  onClearStudyQuestionReference,
  onJumpToQuestionPaper,
  onBeforeSubmit,
  onGenerateImage,
  onToggleImageMode,
  onVoiceTurnSaved,
  autoFocus = true,
  documentUploadsEnabled,
  voiceChatEnabled,
}: {
  chatId: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: () => void;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  messages: UIMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  className?: string;
  selectedVisibilityType: VisibilityType;
  selectedLanguageCode: string;
  onLanguageChange?: (languageCode: string) => void;
  imageGenerationEnabled: boolean;
  imageGenerationSelected: boolean;
  imageGenerationCanGenerate: boolean;
  imageGenerationRequiresPaidCredits: boolean;
  isGeneratingImage: boolean;
  jobTitleReference?: JobTitleReference | null;
  lockJobTitleReference?: boolean;
  onClearJobTitleReference?: () => void;
  studyQuestionReference?: StudyQuestionReference | null;
  onClearStudyQuestionReference?: () => void;
  onJumpToQuestionPaper?: (paperId: string) => void;
  onBeforeSubmit?: () => void | Promise<void>;
  onGenerateImage: () => void;
  onToggleImageMode: () => void;
  onVoiceTurnSaved?: () => void;
  autoFocus?: boolean;
  documentUploadsEnabled: boolean;
  voiceChatEnabled: boolean;
}) {
  const { models, defaultModelId } = useModelConfig();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { width } = useWindowSize();
  const { translate } = useTranslation();
  const inputPlaceholder = useEditableTranslation(
    "chat.input.placeholder",
    "Send a message...",
    "Placeholder text for the main chat input."
  );
  const imagePlaceholder = useEditableTranslation(
    "image.input.placeholder",
    "Describe the image you want to generate...",
    "Placeholder text when image generation mode is active."
  );
  const imageToggleLabel = useMemo(
    () => translate("image.mode.toggle", "Generate image"),
    [translate]
  );
  const imageToggleTooltip = useMemo(
    () =>
      imageGenerationRequiresPaidCredits
        ? translate(
            "image.actions.locked.free.tooltip",
            "Free credits can't be used for images."
          )
        : translate(
            "image.actions.locked.tooltip",
            "Recharge credits to generate images."
          ),
    [translate, imageGenerationRequiresPaidCredits]
  );
  const activePlaceholder = imageGenerationSelected
    ? imagePlaceholder.text
    : inputPlaceholder.text;
  const activePlaceholderEditButton = imageGenerationSelected
    ? imagePlaceholder.editButton
    : inputPlaceholder.editButton;

  const fallbackModelId = useMemo(() => {
    if (!models.length) {
      return null;
    }
    if (defaultModelId && models.some((model) => model.id === defaultModelId)) {
      return defaultModelId;
    }
    return models[0]?.id ?? null;
  }, [models, defaultModelId]);

  const activeModel = fallbackModelId
    ? models.find((model) => model.id === fallbackModelId)
    : undefined;
  const isReasoningModel = activeModel?.supportsReasoning ?? false;

  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      adjustHeight();
    }
  }, [adjustHeight]);

  useEffect(() => {
    if (!autoFocus || !textareaRef.current) {
      return;
    }
    if (width && width <= 768) {
      return;
    }

    textareaRef.current.focus();
  }, [autoFocus, width]);

  const resetHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
  }, []);

  const handleInput = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(event.target.value);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const voiceTurnControllerRef = useRef<WebGeminiVoiceTurnController | null>(
    null
  );
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const [isVoiceDialogOpen, setIsVoiceDialogOpen] = useState(false);
  const [voiceStatus, setVoiceStatus] =
    useState<WebGeminiVoiceTurnStatus>("connecting");
  const [voiceUserTranscript, setVoiceUserTranscript] = useState("");
  const [voiceAssistantTranscript, setVoiceAssistantTranscript] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isVoiceSaving, setIsVoiceSaving] = useState(false);
  const acceptedFileTypes = useMemo(
    () => getAttachmentAcceptValue(documentUploadsEnabled),
    [documentUploadsEnabled]
  );
  const shouldSubmitOnEnter = !(width && width <= 768);
  const voiceStatusLabel = useMemo(() => {
    if (voiceError) {
      return translate("voice.chat.error", "Voice chat failed");
    }
    switch (voiceStatus) {
      case "listening":
        return translate("voice.chat.listening", "Listening...");
      case "thinking":
        return translate("voice.chat.thinking", "Thinking...");
      case "speaking":
        return translate("voice.chat.speaking", "Speaking...");
      default:
        return translate("voice.chat.connecting", "Connecting...");
    }
  }, [translate, voiceError, voiceStatus]);

  const submitForm = useCallback(async () => {
    try {
      await onBeforeSubmit?.();
    } catch (_error) {
      toast.error(
        translate(
          "chat.submit.failed",
          "Unable to start the chat right now. Please try again."
        )
      );
      return;
    }

    const parts: ChatMessage["parts"] = [
      ...attachments.map((attachment) => ({
        type: "file" as const,
        url: attachment.url,
        name: attachment.name,
        mediaType: attachment.contentType,
      })),
      ...(studyQuestionReference
        ? [
            {
              type: "data-studyQuestionReference" as const,
              data: studyQuestionReference,
            },
          ]
        : []),
      ...(jobTitleReference
        ? [
            {
              type: "data-jobTitleReference" as const,
              data: jobTitleReference,
            },
          ]
        : []),
      {
        type: "text",
        text: input,
      },
    ];

    sendMessage({
      role: "user",
      parts,
    });

    setAttachments([]);
    if (!lockJobTitleReference) {
      onClearJobTitleReference?.();
    }
    onClearStudyQuestionReference?.();
    resetHeight();
    setInput("");

    if (width && width > 768) {
      textareaRef.current?.focus();
    }
  }, [
    input, 
    setInput, 
    attachments, 
    sendMessage, 
    setAttachments, 
    width, 
    onBeforeSubmit, 
    onClearJobTitleReference, 
    onClearStudyQuestionReference, 
    jobTitleReference, 
    lockJobTitleReference, 
    studyQuestionReference, 
    resetHeight, translate
  ]);

  const isResponsePending =
    status === "submitted" || status === "streaming";
  const isBusy = (status !== "ready" && status !== "error") || isGeneratingImage;
  const canStopVoice =
    isVoiceDialogOpen && !voiceError && !isVoiceSaving && voiceStatus !== "connecting";

  const resetVoiceState = useCallback(() => {
    setVoiceStatus("connecting");
    setVoiceUserTranscript("");
    setVoiceAssistantTranscript("");
    setVoiceError(null);
    setIsVoiceSaving(false);
  }, []);

  const cancelVoiceChat = useCallback(() => {
    voiceTurnControllerRef.current?.cancel();
    voiceTurnControllerRef.current = null;
    setIsVoiceDialogOpen(false);
    resetVoiceState();
  }, [resetVoiceState]);

  const saveVoiceTurn = useCallback(
    async ({
      assistantText,
      userText,
    }: {
      assistantText: string;
      userText: string;
    }) => {
      const userMessageId = crypto.randomUUID();
      const assistantMessageId = crypto.randomUUID();
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: userMessageId,
          metadata: { createdAt: new Date().toISOString() },
          parts: [{ type: "text", text: userText }],
          role: "user",
        },
        {
          id: assistantMessageId,
          metadata: { createdAt: new Date().toISOString() },
          parts: [{ type: "text", text: assistantText }],
          role: "assistant",
        },
      ]);

      const response = await fetch("/api/chat/voice-turn", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assistantMessageId,
          assistantText,
          chatId: _chatId,
          selectedVisibilityType: _selectedVisibilityType,
          userMessageId,
          userText,
        }),
      });
      if (!response.ok) {
        throw new Error(
          translate("voice.chat.save_failed", "Unable to save this voice chat.")
        );
      }

      onVoiceTurnSaved?.();
    },
    [_chatId, _selectedVisibilityType, onVoiceTurnSaved, setMessages, translate]
  );

  const finishVoiceChat = useCallback(async () => {
    const controller = voiceTurnControllerRef.current;
    if (!controller || isVoiceSaving) {
      return;
    }

    const capturedUserText = voiceUserTranscript.trim();
    const capturedAssistantText = voiceAssistantTranscript.trim();
    if (capturedUserText && capturedAssistantText) {
      controller.cancel();
      voiceTurnControllerRef.current = null;
      setIsVoiceDialogOpen(false);
      resetVoiceState();
      void saveVoiceTurn({
        assistantText: capturedAssistantText,
        userText: capturedUserText,
      }).catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : translate("voice.chat.save_failed", "Unable to save this voice chat.")
        );
      });
      return;
    }

    setIsVoiceSaving(true);
    try {
      const result = await controller.stop();
      const userText = result.userText.trim();
      const assistantText = result.assistantText.trim();
      if (!userText || !assistantText) {
        throw new Error(
          translate(
            "voice.chat.empty_result",
            "I could not hear enough speech. Please try again."
          )
        );
      }

      await saveVoiceTurn({ assistantText, userText });
      voiceTurnControllerRef.current = null;
      setIsVoiceDialogOpen(false);
      resetVoiceState();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : translate("voice.chat.failed", "Voice chat failed. Please try again.");
      setVoiceError(message);
      setIsVoiceSaving(false);
    }
  }, [
    isVoiceSaving,
    resetVoiceState,
    saveVoiceTurn,
    translate,
    voiceAssistantTranscript,
    voiceUserTranscript,
  ]);

  const startVoiceChat = useCallback(async () => {
    if (!voiceChatEnabled) {
      toast.error(
        translate("voice.chat.disabled", "Voice chat is currently unavailable.")
      );
      return;
    }
    if (isBusy || imageGenerationSelected) {
      return;
    }

    resetVoiceState();
    setIsVoiceDialogOpen(true);
    try {
      const controller = await startWebGeminiVoiceTurn({
        onAssistantTranscript: setVoiceAssistantTranscript,
        onError: (error) => {
          setVoiceError(error.message);
        },
        onStatus: setVoiceStatus,
        onUserTranscript: setVoiceUserTranscript,
      });
      voiceTurnControllerRef.current = controller;
    } catch (error) {
      setVoiceError(
        error instanceof Error
          ? error.message
          : translate("voice.chat.failed", "Voice chat failed. Please try again.")
      );
    }
  }, [
    imageGenerationSelected,
    isBusy,
    resetVoiceState,
    translate,
    voiceChatEnabled,
  ]);

  const uploadFile = useCallback(
    async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch("/api/files/upload", {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          const { url, pathname, contentType } = data;

          return {
            url,
            name: pathname,
            contentType,
          };
        }
        const { error } = await response.json();
        const fallbackError = translate(
          "chat.upload.error_generic",
          "Failed to upload file, please try again!"
        );
        const errorMessage =
          typeof error === "string" && error.trim().length > 0
            ? error
            : fallbackError;
        toast.error(errorMessage);
      } catch (_error) {
        toast.error(
          translate(
            "chat.upload.error_generic",
            "Failed to upload file, please try again!"
          )
        );
      }
    },
    [translate]
  );

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);

      setUploadQueue(files.map((file) => file.name));

      try {
        const uploadPromises = files.map((file) => uploadFile(file));
        const uploadedAttachments = await Promise.all(uploadPromises);
        const successfullyUploadedAttachments = uploadedAttachments.filter(
          (attachment) => attachment !== undefined
        );

        setAttachments((currentAttachments) => [
          ...currentAttachments,
          ...successfullyUploadedAttachments,
        ]);
      } catch (error) {
        console.error("Error uploading files!", error);
      } finally {
        setUploadQueue([]);
      }
    },
    [setAttachments, uploadFile]
  );

  return (
    <div className={cn("relative flex w-full flex-col gap-4", className)}>
      <input
        className="-top-4 -left-4 pointer-events-none fixed size-0.5 opacity-0"
        accept={acceptedFileTypes}
        multiple
        onChange={handleFileChange}
        ref={fileInputRef}
        tabIndex={-1}
        type="file"
      />

      {studyQuestionReference ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-muted/40 px-3 py-2 shadow-xs">
          <button
            className="min-w-0 flex-1 cursor-pointer space-y-0.5 text-left"
            onClick={(event) => {
              event.preventDefault();
              onJumpToQuestionPaper?.(studyQuestionReference.paperId);
            }}
            type="button"
          >
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <MessageIcon size={12} />
              Question reference
            </div>
            <div className="truncate font-medium text-sm">
              {studyQuestionReference.title}
            </div>
            <div className="truncate text-muted-foreground text-xs">
              {studyQuestionReference.preview}
            </div>
          </button>
          <Button
            aria-label="Remove question reference"
            className="h-7 w-7 shrink-0 rounded-md p-0"
            onClick={(event) => {
              event.preventDefault();
              onClearStudyQuestionReference?.();
            }}
            type="button"
            variant="ghost"
          >
            <CrossSmallIcon size={14} />
          </Button>
        </div>
      ) : null}

      {jobTitleReference ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-muted/40 px-3 py-2 shadow-xs">
          <div className="min-w-0 flex-1 space-y-0.5 text-left">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <MessageIcon size={12} />
              {lockJobTitleReference ? "Chat about this job" : "Replying about"}
            </div>
            <div className="truncate font-medium text-sm">
              {jobTitleReference.title}
            </div>
            <div className="truncate text-muted-foreground text-xs">
              {jobTitleReference.preview}
            </div>
          </div>
          {lockJobTitleReference ? null : (
            <Button
              aria-label="Remove job reference"
              className="h-7 w-7 shrink-0 rounded-md p-0"
              onClick={(event) => {
                event.preventDefault();
                onClearJobTitleReference?.();
              }}
              type="button"
              variant="ghost"
            >
              <CrossSmallIcon size={14} />
            </Button>
          )}
        </div>
      ) : null}

      <PromptInput
        className="rounded-xl border border-border bg-background p-3 shadow-xs transition-all duration-200 focus-within:border-border hover:border-muted-foreground/50"
        onSubmit={(event) => {
          event.preventDefault();
        if (isBusy) {
          toast.error(
            translate(
              "chat.input.wait_for_response",
              "Please wait for the model to finish its response!"
            )
          );
        } else {
          if (imageGenerationSelected) {
            onGenerateImage();
          } else {
            void submitForm();
          }
        }
      }}
      >
        {(attachments.length > 0 || uploadQueue.length > 0) && (
          <div
            className="flex flex-row items-end gap-2 overflow-x-scroll"
            data-testid="attachments-preview"
          >
            {attachments.map((attachment) => (
              <PreviewAttachment
                attachment={attachment}
                key={attachment.url}
                onRemove={() => {
                  setAttachments((currentAttachments) =>
                    currentAttachments.filter((a) => a.url !== attachment.url)
                  );
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
              />
            ))}

            {uploadQueue.map((filename) => (
              <PreviewAttachment
                attachment={{
                  url: "",
                  name: filename,
                  contentType: "",
                }}
                isUploading={true}
                key={filename}
              />
            ))}
          </div>
        )}
        <div className="relative flex flex-row items-start gap-1 sm:gap-2">
          <PromptInputTextarea
            className="grow resize-none border-0! border-none! bg-transparent p-2 text-sm outline-none ring-0 [-ms-overflow-style:none] [scrollbar-width:none] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-scrollbar]:hidden"
            data-testid="multimodal-input"
            disableAutoResize={true}
            maxHeight={200}
            minHeight={44}
            onChange={handleInput}
            placeholder={activePlaceholder}
            ref={textareaRef}
            rows={1}
            submitOnEnter={shouldSubmitOnEnter}
            value={input}
          />
          {!input && activePlaceholderEditButton ? (
            <div className="absolute left-2 top-2 z-10">
              {activePlaceholderEditButton}
            </div>
          ) : null}
        </div>
        <PromptInputToolbar className="!border-top-0 border-t-0! p-0 shadow-none dark:border-0 dark:border-transparent!">
          <PromptInputTools className="gap-0 sm:gap-0.5">
            <AttachmentsButton
              fileInputRef={fileInputRef}
              isReasoningModel={isReasoningModel}
              isBusy={isBusy}
            />
            <ImageModeToggle
              canGenerate={imageGenerationCanGenerate}
              enabled={imageGenerationEnabled}
              isActive={imageGenerationSelected}
              label={imageToggleLabel}
              tooltip={imageToggleTooltip}
              onToggle={onToggleImageMode}
            />
            <LanguageSelectorCompact
              onLanguageChange={onLanguageChange}
              selectedLanguageCode={selectedLanguageCode}
            />
          </PromptInputTools>

          {isResponsePending ? (
            <StopButton setMessages={setMessages} stop={stop} />
          ) : (
            <div className="flex items-center gap-1">
              {voiceChatEnabled && !imageGenerationSelected ? (
                <Button
                  aria-label={translate("voice.chat.open", "Start voice chat")}
                  className="size-8 rounded-full p-0 transition-colors"
                  disabled={isBusy || uploadQueue.length > 0}
                  onClick={(event) => {
                    event.preventDefault();
                    void startVoiceChat();
                  }}
                  type="button"
                  variant="ghost"
                >
                  <Mic className="size-4" />
                </Button>
              ) : null}
              <PromptInputSubmit
                aria-label="Send message"
                className="size-8 rounded-full bg-primary text-primary-foreground transition-colors duration-200 hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
                data-testid="send-button"
                disabled={!input.trim() || uploadQueue.length > 0 || isBusy}
                status={status}
              >
                <ArrowUpIcon size={14} />
              </PromptInputSubmit>
            </div>
          )}
        </PromptInputToolbar>
      </PromptInput>

      {isVoiceDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="flex size-14 items-center justify-center rounded-full bg-muted">
                <Mic className="size-7" />
              </div>
              <div>
                <EditableTranslation
                  className="font-semibold text-lg"
                  defaultText="Voice chat"
                  description="Title for the web voice chat dialog."
                  translationKey="voice.chat.title"
                />
                <p className="text-muted-foreground text-sm">{voiceStatusLabel}</p>
              </div>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <EditableTranslation
                  className="font-semibold text-muted-foreground text-xs uppercase"
                  defaultText="You"
                  description="Label for the user's voice transcript."
                  translationKey="voice.chat.you"
                />
                <p className="mt-2 min-h-7 text-sm">
                  {voiceUserTranscript ||
                    translate(
                      "voice.chat.waiting_for_speech",
                      "Waiting for speech..."
                    )}
                </p>
              </div>
              <div>
                <EditableTranslation
                  className="font-semibold text-muted-foreground text-xs uppercase"
                  defaultText="KhasiGPT"
                  description="Label for the assistant's voice transcript."
                  translationKey="voice.chat.assistant"
                />
                <p className="mt-2 min-h-7 text-sm">
                  {voiceAssistantTranscript ||
                    translate(
                      "voice.chat.waiting_for_response",
                      "Waiting for response..."
                    )}
                </p>
              </div>
            </div>

            {voiceError ? (
              <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm">
                {voiceError}
              </p>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <Button
                disabled={isVoiceSaving}
                onClick={cancelVoiceChat}
                type="button"
                variant="outline"
              >
                {translate("voice.chat.cancel", "Cancel")}
              </Button>
              <Button
                disabled={!canStopVoice}
                onClick={() => void finishVoiceChat()}
                type="button"
              >
                {isVoiceSaving
                  ? translate("voice.chat.thinking", "Thinking...")
                  : translate("voice.chat.stop", "Stop and send")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const MultimodalInput = memo(
  PureMultimodalInput,
  (prevProps, nextProps) => {
    if (prevProps.input !== nextProps.input) {
      return false;
    }
    if (prevProps.status !== nextProps.status) {
      return false;
    }
    if (prevProps.isGeneratingImage !== nextProps.isGeneratingImage) {
      return false;
    }
    if (
      prevProps.imageGenerationSelected !== nextProps.imageGenerationSelected
    ) {
      return false;
    }
    if (
      prevProps.imageGenerationEnabled !== nextProps.imageGenerationEnabled ||
      prevProps.imageGenerationCanGenerate !==
        nextProps.imageGenerationCanGenerate
    ) {
      return false;
    }
    if (
      prevProps.imageGenerationRequiresPaidCredits !==
      nextProps.imageGenerationRequiresPaidCredits
    ) {
      return false;
    }
    if (prevProps.documentUploadsEnabled !== nextProps.documentUploadsEnabled) {
      return false;
    }
    if (prevProps.voiceChatEnabled !== nextProps.voiceChatEnabled) {
      return false;
    }
    if (!equal(prevProps.attachments, nextProps.attachments)) {
      return false;
    }
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
      return false;
    }
    if (prevProps.selectedLanguageCode !== nextProps.selectedLanguageCode) {
      return false;
    }
    if (prevProps.autoFocus !== nextProps.autoFocus) {
      return false;
    }
    if (
      !equal(
        prevProps.studyQuestionReference,
        nextProps.studyQuestionReference
      )
    ) {
      return false;
    }
    if (!equal(prevProps.jobTitleReference, nextProps.jobTitleReference)) {
      return false;
    }
    if (prevProps.lockJobTitleReference !== nextProps.lockJobTitleReference) {
      return false;
    }

    return true;
  }
);

function PureAttachmentsButton({
  fileInputRef,
  isBusy,
  isReasoningModel,
}: {
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  isBusy: boolean;
  isReasoningModel: boolean;
}) {
  return (
    <Button
      className="aspect-square h-8 rounded-lg p-1 transition-colors hover:bg-accent"
      data-testid="attachments-button"
      disabled={isBusy || isReasoningModel}
      onClick={(event) => {
        event.preventDefault();
        fileInputRef.current?.click();
      }}
      variant="ghost"
    >
      <PaperclipIcon size={14} style={{ width: 14, height: 14 }} />
    </Button>
  );
}

const AttachmentsButton = memo(PureAttachmentsButton);

function PureLanguageSelectorCompact({
  selectedLanguageCode,
  onLanguageChange,
}: {
  selectedLanguageCode: string;
  onLanguageChange?: (languageCode: string) => void;
}) {
  const {
    languages,
    activeLanguage,
    translate,
    isUpdating: isLanguageUpdating,
  } = useTranslation();
  const [optimisticLanguageCode, setOptimisticLanguageCode] = useState(
    selectedLanguageCode
  );

  useEffect(() => {
    setOptimisticLanguageCode(selectedLanguageCode);
  }, [selectedLanguageCode]);

  const effectiveLanguageCode = useMemo(() => {
    if (languages.some((language) => language.code === optimisticLanguageCode)) {
      return optimisticLanguageCode;
    }
    if (activeLanguage?.code) {
      return activeLanguage.code;
    }
    return languages[0]?.code ?? optimisticLanguageCode;
  }, [activeLanguage?.code, languages, optimisticLanguageCode]);

  const selectedLanguage = useMemo(
    () => languages.find((language) => language.code === effectiveLanguageCode),
    [effectiveLanguageCode, languages]
  );

  const activeLabel = translate("user_menu.language.active", "Active");
  const updatingLabel = translate("user_menu.language.updating", "Updating...");
  const triggerLabel = translate("user_menu.language", "Language");

  if (languages.length === 0) {
    return null;
  }

  return (
    <PromptInputModelSelect
      onValueChange={(languageCode) => {
        const language = languages.find(
          (item) => item.code === languageCode
        );
        if (language) {
          setOptimisticLanguageCode(language.code);
          onLanguageChange?.(language.code);
        }
      }}
      value={effectiveLanguageCode}
    >
      <Trigger
        aria-label={triggerLabel}
        className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border-0 bg-background px-2 text-foreground shadow-none transition-colors hover:bg-accent focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        data-testid="language-selector"
        type="button"
      >
        <GlobeIcon size={14} />
        <span className="font-medium text-xs">
          {selectedLanguage?.name ?? triggerLabel}
        </span>
        <ChevronDownIcon size={16} />
      </Trigger>
      <PromptInputModelSelectContent className="min-w-[220px] p-0">
        <div className="flex flex-col gap-px">
          {languages.map((language) => {
            const isSelected = language.code === effectiveLanguageCode;
            const shouldPromptUiSync =
              Boolean(language.syncUiLanguage) &&
              activeLanguage.code !== language.code;

            return (
              <SelectItem
                disabled={
                  isLanguageUpdating && language.code !== effectiveLanguageCode
                }
                key={language.code}
                onPointerDown={() => {
                  if (!isSelected || !shouldPromptUiSync) {
                    return;
                  }
                  onLanguageChange?.(language.code);
                }}
                value={language.code}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="truncate font-medium text-xs">
                    {language.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {language.code === effectiveLanguageCode
                      ? isLanguageUpdating
                        ? updatingLabel
                        : activeLabel
                      : null}
                  </span>
                </div>
              </SelectItem>
            );
          })}
        </div>
      </PromptInputModelSelectContent>
    </PromptInputModelSelect>
  );
}

const LanguageSelectorCompact = memo(PureLanguageSelectorCompact);

function ImageModeToggle({
  enabled,
  isActive,
  canGenerate,
  label,
  tooltip,
  onToggle,
}: {
  enabled: boolean;
  isActive: boolean;
  canGenerate: boolean;
  label: string;
  tooltip: string;
  onToggle: () => void;
}) {
  if (!enabled) {
    return null;
  }

  const button = (
    <Button
      aria-label={label}
      aria-pressed={isActive}
      className={cn(
        "h-8 gap-1 rounded-lg border-0 px-2 text-xs transition-colors",
        isActive
          ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
          : "bg-background hover:bg-accent"
      )}
      onClick={(event) => {
        event.preventDefault();
        onToggle();
      }}
      size="sm"
      type="button"
      variant="ghost"
    >
      <ImageIcon size={14} />
      <span className="inline">
        <EditableTranslation
          defaultText="Generate image"
          description="Chat input toggle for image generation mode."
          translationKey="image.mode.toggle"
        />
      </span>
    </Button>
  );

  if (canGenerate) {
    return button;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function PureStopButton({
  stop,
  setMessages,
}: {
  stop: () => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
}) {
  return (
    <Button
      aria-label="Stop generating response"
      className="size-8 rounded-lg bg-black p-0 text-white shadow-xs transition-colors duration-200 hover:bg-black/90 disabled:bg-muted disabled:text-muted-foreground"
      data-testid="stop-button"
      onClick={(event) => {
        event.preventDefault();
        stop();
        setMessages((messages) => messages);
      }}
      title="Stop generating response"
      type="button"
    >
      <StopIcon size={14} />
    </Button>
  );
}

const StopButton = memo(PureStopButton);
