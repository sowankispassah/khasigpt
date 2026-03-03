"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Response } from "@/components/elements/response";
import { LoaderIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { JobCard } from "@/lib/jobs/types";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

type JobsChatPanelProps = {
  onApplyJobIds: (jobIds: string[] | null) => void;
};

const CHAT_MODEL_FALLBACK = "default";
const CHAT_LANGUAGE_FALLBACK = "en";

type JobCardPart = {
  hasPart: boolean;
  jobIds: string[];
};

function getMessageText(message: ChatMessage) {
  return (message.parts ?? [])
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function extractLatestJobCardPart(messages: ChatMessage[]): JobCardPart | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") {
      continue;
    }

    for (const part of message.parts ?? []) {
      if (part.type !== "data-jobCards") {
        continue;
      }

      const data = (part as { data?: { jobs?: JobCard[] } }).data;
      const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
      return {
        hasPart: true,
        jobIds: jobs.map((job) => job.id),
      };
    }
  }

  return null;
}

export function JobsChatPanel({ onApplyJobIds }: JobsChatPanelProps) {
  const [chatId, setChatId] = useState(() => generateUUID());
  const [input, setInput] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const { messages, sendMessage, setMessages, status } = useChat<ChatMessage>({
    id: chatId,
    messages: [],
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest(request) {
        return {
          body: {
            id: request.id,
            message: request.messages.at(-1),
            selectedChatModel: CHAT_MODEL_FALLBACK,
            selectedLanguage: CHAT_LANGUAGE_FALLBACK,
            selectedVisibilityType: "private",
            chatMode: "jobs",
            jobPostingId: null,
          },
        };
      },
    }),
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unable to process your request.";
      setErrorText(message);
    },
  });

  const isSending = status === "submitted" || status === "streaming";
  const latestJobCardPart = useMemo(() => extractLatestJobCardPart(messages), [messages]);

  useEffect(() => {
    if (!latestJobCardPart?.hasPart) {
      return;
    }
    onApplyJobIds(latestJobCardPart.jobIds);
  }, [latestJobCardPart, onApplyJobIds]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const text = input.trim();
    if (!text || isSending) {
      return;
    }

    setErrorText(null);
    sendMessage({
      role: "user",
      parts: [{ type: "text", text }],
    });
    setInput("");
  };

  const handleNewChat = () => {
    setMessages([]);
    setInput("");
    setErrorText(null);
    onApplyJobIds(null);
    setChatId(generateUUID());
  };

  return (
    <Card className="flex h-[68vh] min-h-[420px] flex-col border-border/70">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Job Chat</CardTitle>
        <Button
          className="cursor-pointer"
          disabled={isSending}
          onClick={handleNewChat}
          size="sm"
          type="button"
          variant="outline"
        >
          New Job Chat
        </Button>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-md border bg-muted/20 p-3">
          {messages.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Ask about qualification, salary range, job type, location, or follow-up refinements.
            </p>
          ) : (
            messages.map((message) => {
              const text = getMessageText(message);
              const isUser = message.role === "user";

              return (
                <div className={`flex ${isUser ? "justify-end" : "justify-start"}`} key={message.id}>
                  <div
                    className={`max-w-[92%] rounded-lg px-3 py-2 text-sm ${
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : "border border-border/60 bg-background"
                    }`}
                  >
                    {text ? (
                      isUser ? (
                        <p className="whitespace-pre-wrap">{text}</p>
                      ) : (
                        <Response className="prose prose-zinc max-w-none text-sm [&_p]:my-1">
                          {text}
                        </Response>
                      )
                    ) : message.role === "assistant" ? (
                      <p className="text-muted-foreground text-xs">Updated job results.</p>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}

          {isSending ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <span className="inline-flex h-4 w-4 animate-spin items-center justify-center">
                <LoaderIcon size={14} />
              </span>
              Filtering jobs...
            </div>
          ) : null}

          <div ref={messagesEndRef} />
        </div>

        {errorText ? <p className="text-destructive text-xs">{errorText}</p> : null}

        <form className="mt-auto space-y-2 border-t pt-3" onSubmit={handleSubmit}>
          <Textarea
            className="min-h-[88px] resize-none"
            disabled={isSending}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask for jobs by qualification, salary, location, part-time, government, and more..."
            value={input}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-xs">
              Filters are strict and based only on available job data.
            </p>
            <Button className="cursor-pointer" disabled={isSending || input.trim().length === 0} type="submit">
              {isSending ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex h-4 w-4 animate-spin items-center justify-center">
                    <LoaderIcon size={14} />
                  </span>
                  Filtering...
                </span>
              ) : (
                "Send"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
