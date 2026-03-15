"use client";

import type { DataUIPart } from "ai";
import type { UseChatHelpers } from "@ai-sdk/react";
import { useEffect } from "react";
import type { ChatMessage, CustomUIDataTypes } from "@/lib/types";

export type UseAutoResumeParams = {
  autoResume: boolean;
  initialMessages: ChatMessage[];
  resumeStream: UseChatHelpers<ChatMessage>["resumeStream"];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  resumeDataPart: DataUIPart<CustomUIDataTypes> | null;
};

export function useAutoResume({
  autoResume,
  initialMessages,
  resumeStream,
  setMessages,
  resumeDataPart,
}: UseAutoResumeParams) {
  useEffect(() => {
    if (!autoResume) {
      return;
    }

    const mostRecentMessage = initialMessages.at(-1);

    if (mostRecentMessage?.role === "user") {
      resumeStream();
    }

    // we intentionally run this once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResume, initialMessages.at, resumeStream]);

  useEffect(() => {
    if (!resumeDataPart) {
      return;
    }
    if (resumeDataPart.type === "data-appendMessage") {
      const message = JSON.parse(resumeDataPart.data);
      setMessages([...initialMessages, message]);
    }
  }, [initialMessages, resumeDataPart, setMessages]);
}
