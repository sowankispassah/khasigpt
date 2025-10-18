"use client";
import type { UseChatHelpers } from "@ai-sdk/react";
import equal from "fast-deep-equal";
import { motion } from "framer-motion";
import { memo, useState } from "react";
import type { Vote } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { cn, sanitizeText } from "@/lib/utils";
import { useDataStream } from "./data-stream-provider";
import { DocumentToolResult } from "./document";
import { DocumentPreview } from "./document-preview";
import { MessageContent } from "./elements/message";
import { Response } from "./elements/response";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "./elements/tool";
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

  const isAssistantMessage = message.role === "assistant";

  useDataStream();

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="group/message w-full"
      data-role={message.role}
      data-testid={`message-${message.role}`}
      initial={{ opacity: 0 }}
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
          {attachmentsFromMessage.length > 0 && (
            <div
              className="flex flex-row justify-end gap-2"
              data-testid={"message-attachments"}
            >
              {attachmentsFromMessage.map((attachment) => (
                <PreviewAttachment
                  attachment={{
                    name: attachment.filename ?? "file",
                    contentType: attachment.mediaType,
                    url: attachment.url,
                  }}
                  key={attachment.url}
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
                        "w-fit break-words rounded-2xl px-3 py-2 text-right text-white":
                          message.role === "user",
                        "flex-1 bg-transparent py-0 text-left pl-3 pr-2 md:pl-4 md:pr-3":
                          isAssistantMessage,
                      })}
                      data-testid="message-content"
                      style={
                        message.role === "user"
                          ? { backgroundColor: "#006cff" }
                          : undefined
                      }
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
                          {sanitizeText(part.text)}
                        </Response>
                        {isAssistantMessage && showStreamingSpinner && (
                          <span className="inline-flex size-4 items-center justify-center animate-spin text-muted-foreground">
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

            if (type === "tool-createDocument") {
              const { toolCallId } = part;
              const output = (part as { output?: unknown }).output;

              if (output && typeof output === "object" && "error" in output) {
                return (
                  <div
                    className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
                    key={toolCallId}
                  >
                    Error creating document: {String((output as { error: unknown }).error)}
                  </div>
                );
              }

              return (
                <DocumentPreview
                  isReadonly={isReadonly}
                  key={toolCallId}
                  result={output}
                />
              );
            }

            if (type === "tool-updateDocument") {
              const { toolCallId } = part;
              const output = (part as { output?: unknown }).output;
              const documentArgs =
                output && typeof output === "object"
                  ? (output as Record<string, unknown>)
                  : undefined;

              if (output && typeof output === "object" && "error" in output) {
                return (
                  <div
                    className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-500 dark:bg-red-950/50"
                    key={toolCallId}
                  >
                    Error updating document: {String((output as { error: unknown }).error)}
                  </div>
                );
              }

              return (
                <div className="relative" key={toolCallId}>
                  <DocumentPreview
                    args={{ ...(documentArgs ?? {}), isUpdate: true }}
                    isReadonly={isReadonly}
                    result={output}
                  />
                </div>
              );
            }

            if (type === "tool-requestSuggestions") {
              const { toolCallId, state } = part;

              return (
                <Tool defaultOpen={true} key={toolCallId}>
                  <ToolHeader state={state} type="tool-requestSuggestions" />
                  <ToolContent>
                    {state === "input-available" && (
                      <ToolInput input={part.input} />
                    )}
                    {state === "output-available" && (
                      <ToolOutput
                        errorText={undefined}
                        output={(() => {
                          const output = (part as { output?: unknown }).output;
                          const rawDocumentResult =
                            output && typeof output === "object"
                              ? (output as Record<string, unknown>)
                              : undefined;

                          if (output && typeof output === "object" && "error" in output) {
                            return (
                              <div className="rounded border p-2 text-red-500">
                                Error: {String((output as { error: unknown }).error)}
                              </div>
                            );
                          }

                          const documentResult = (() => {
                            if (!rawDocumentResult) {
                              return undefined;
                            }

                            const { id, title, kind } = rawDocumentResult;

                            if (
                              typeof id === "string" &&
                              typeof title === "string" &&
                              (kind === "text" ||
                                kind === "code" ||
                                kind === "image" ||
                                kind === "sheet")
                            ) {
                              return {
                                id,
                                title,
                                kind,
                              } as const;
                            }

                            return undefined;
                          })();

                          if (!documentResult) {
                            return (
                              <div className="rounded border p-2 text-amber-600">
                                Unable to display document suggestions.
                              </div>
                            );
                          }

                          return (
                            <DocumentToolResult
                              isReadonly={isReadonly}
                              result={documentResult}
                              type="request-suggestions"
                            />
                          );
                        })()}
                      />
                    )}
                  </ToolContent>
                </Tool>
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
                  className="flex-1 bg-transparent py-0 text-left pl-3 pr-2 md:pl-4 md:pr-3"
                  data-testid="message-content"
                >
                  <div className="flex w-full items-end justify-start">
                    <span className="inline-flex size-4 items-center justify-center animate-spin text-muted-foreground">
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
    </motion.div>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) {
      return false;
    }
    if (prevProps.message.id !== nextProps.message.id) {
      return false;
    }
    if (prevProps.requiresScrollPadding !== nextProps.requiresScrollPadding) {
      return false;
    }
    if (!equal(prevProps.message.parts, nextProps.message.parts)) {
      return false;
    }
    if (!equal(prevProps.vote, nextProps.vote)) {
      return false;
    }

    return false;
  }
);

export const ThinkingMessage = () => {
  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="group/message w-full py-1"
      data-role="assistant"
      data-testid="message-assistant-loading"
      initial={{ opacity: 0 }}
    >
      <div className="flex items-center justify-start">
        <span className="flex items-center gap-2 text-muted-foreground text-sm">
          <span className="flex size-4 items-center justify-center animate-spin text-muted-foreground">
            <LoaderIcon size={16} />
          </span>
        </span>
      </div>
    </motion.div>
  );
};



