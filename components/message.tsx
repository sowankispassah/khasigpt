"use client";
import type { UseChatHelpers } from "@ai-sdk/react";
import { memo, useState } from "react";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MessageContent } from "./elements/message";
import { Response } from "./elements/response";
import { LoaderIcon } from "./icons";
import { MessageActions } from "./message-actions";
import { MessageEditor } from "./message-editor";
import { MessageReasoning } from "./message-reasoning";
import { PreviewAttachment } from "./preview-attachment";

const PurePreviewMessage = ({
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  regenerate,
  isReadonly,
  requiresScrollPadding,
}: {
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  requiresScrollPadding: boolean;
}) => {
  const [mode, setMode] = useState<"view" | "edit">("view");

  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === "file"
  );
  const messageAttachments = attachmentsFromMessage
    .map((attachment, index) => {
      const resolvedUrl = attachment.url ?? "";
      if (!resolvedUrl) {
        return null;
      }
      const filename =
        attachment.filename ??
        ("name" in attachment && typeof attachment.name === "string"
          ? attachment.name
          : undefined) ??
        "file";

      return {
        id: `${message.id}-attachment-${index}`,
        name: filename,
        contentType: attachment.mediaType ?? "",
        url: resolvedUrl,
      };
    })
    .filter(
      (
        attachment
      ): attachment is {
        id: string;
        name: string;
        contentType: string;
        url: string;
      } => attachment !== null
    );

  const isAssistantMessage = message.role === "assistant";

  return (
    <div
      className="group/message w-full"
      data-role={message.role}
      data-testid={`message-${message.role}`}
    >
      <div
        className={cn("flex w-full items-start gap-2 md:gap-3", {
          "justify-end": message.role === "user" && mode !== "edit",
          "justify-start": message.role === "assistant",
        })}
      >
        <div
          className={cn("flex flex-col", {
            "gap-2 md:gap-4": message.parts?.some(
              (p) => p.type === "text" && p.text?.trim()
            ),
            "min-h-96": isAssistantMessage && requiresScrollPadding,
            "w-full":
              (isAssistantMessage &&
                message.parts?.some(
                  (p) => p.type === "text" && p.text?.trim()
                )) ||
              mode === "edit",
            "max-w-[calc(100%-2.5rem)] sm:max-w-[min(fit-content,80%)]":
              message.role === "user" && mode !== "edit",
          })}
        >
          {messageAttachments.length > 0 && (
            <div
              className={cn(
                "flex gap-2",
                isAssistantMessage
                  ? "flex-wrap items-start justify-start"
                  : "flex-row justify-end"
              )}
              data-testid={"message-attachments"}
            >
              {messageAttachments.map((attachment) => (
                <PreviewAttachment
                  attachment={{
                    name: attachment.name,
                    contentType: attachment.contentType,
                    url: attachment.url,
                  }}
                  key={attachment.id}
                  previewSize={isAssistantMessage ? 240 : undefined}
                  showName={!isAssistantMessage}
                />
              ))}
            </div>
          )}

          {message.parts?.map((part, index) => {
            const { type } = part;
            const key = `message-${message.id}-part-${index}`;

            if (type === "reasoning" && part.text?.trim().length > 0) {
              return (
                <MessageReasoning
                  isLoading={isLoading}
                  key={key}
                  reasoning={part.text}
                />
              );
            }

            if (type === "text") {
              const isLastPart = index === message.parts.length - 1;
              const showStreamingSpinner =
                isAssistantMessage && isLoading && isLastPart;

              if (mode === "view") {
                return (
                  <div
                    className={cn({
                      "flex w-full items-end gap-2": isAssistantMessage,
                    })}
                    key={key}
                  >
                    <MessageContent
                      className={cn({
                        "w-fit break-words rounded-2xl bg-[#e9e9e980] px-3 py-2 text-right text-foreground dark:bg-[#323232d9] dark:text-white":
                          message.role === "user",
                        "flex-1 bg-transparent py-0 pr-2 pl-3 text-left md:pr-3 md:pl-4":
                          isAssistantMessage,
                      })}
                      data-testid="message-content"
                    >
                      <div
                        className={cn({
                          "flex w-full items-end gap-2":
                            isAssistantMessage && showStreamingSpinner,
                          "w-full": isAssistantMessage,
                        })}
                      >
                        <Response
                          className={cn({
                            "w-full": isAssistantMessage,
                          })}
                        >
                          {part.text}
                        </Response>
                        {isAssistantMessage && showStreamingSpinner && (
                          <span className="inline-flex size-4 animate-spin items-center justify-center text-muted-foreground">
                            <LoaderIcon size={14} />
                          </span>
                        )}
                      </div>
                    </MessageContent>
                  </div>
                );
              }

              if (mode === "edit") {
                return (
                  <div
                    className="flex w-full flex-row items-start gap-3"
                    key={key}
                  >
                    <div className="size-8" />
                    <div className="min-w-0 flex-1">
                      <MessageEditor
                        key={message.id}
                        message={message}
                        regenerate={regenerate}
                        setMessages={setMessages}
                        setMode={setMode}
                      />
                    </div>
                  </div>
                );
              }
            }

            if (
              type === "tool-createDocument" ||
              type === "tool-updateDocument" ||
              type === "tool-requestSuggestions"
            ) {
              return (
                <div
                  className="rounded-lg border bg-muted/40 px-3 py-2 text-muted-foreground text-sm"
                  key={`tool-${message.id}-${index}`}
                >
                  Document tools are disabled in this deployment.
                </div>
              );
            }

            return null;
          })}

          {isAssistantMessage &&
            isLoading &&
            !message.parts?.some(
              (part) => part.type === "text" && part.text?.trim()
            ) && (
              <div className="flex w-full items-end gap-2">
                <MessageContent
                  className="flex-1 bg-transparent py-0 pr-2 pl-3 text-left md:pr-3 md:pl-4"
                  data-testid="message-content"
                >
                  <div className="flex w-full items-end justify-start">
                    <span className="inline-flex size-4 animate-spin items-center justify-center text-muted-foreground">
                      <LoaderIcon size={14} />
                    </span>
                  </div>
                </MessageContent>
              </div>
            )}

          {!isReadonly && (
            <MessageActions
              chatId={chatId}
              isLoading={isLoading}
              key={`action-${message.id}`}
              message={message}
              setMode={setMode}
              vote={vote}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export const PreviewMessage = memo(PurePreviewMessage);

export const ThinkingMessage = () => {
  return (
    <div
      className="group/message w-full py-1"
      data-role="assistant"
      data-testid="message-assistant-loading"
    >
      <div className="flex items-center justify-start">
        <span className="flex items-center gap-2 text-muted-foreground text-sm">
          <span className="flex size-4 animate-spin items-center justify-center text-muted-foreground">
            <LoaderIcon size={16} />
          </span>
        </span>
      </div>
    </div>
  );
};
