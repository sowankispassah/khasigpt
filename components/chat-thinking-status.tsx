"use client";

import { useEffect, useState } from "react";
import { AnimatedStatus } from "@/components/animated-status";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";

function getChatGenerationStatusCopy(elapsedMs: number) {
  if (elapsedMs >= 12_000) {
    return {
      defaultText: "Finalizing the response",
      description:
        "Status shown while KhasiGPT finishes preparing a chat response.",
      key: "chat.status.finalizing_response",
    };
  }
  if (elapsedMs >= 8_000) {
    return {
      defaultText: "Working through the details",
      description:
        "Status shown while KhasiGPT works through the details of a chat request.",
      key: "chat.status.working_through_details",
    };
  }
  if (elapsedMs >= 5_000) {
    return {
      defaultText: "Preparing a response",
      description:
        "Status shown while KhasiGPT prepares a response to a chat request.",
      key: "chat.status.preparing_response",
    };
  }
  if (elapsedMs >= 2_000) {
    return {
      defaultText: "Understanding your request",
      description:
        "Status shown while KhasiGPT understands the user's chat request.",
      key: "chat.status.understanding_request",
    };
  }
  return {
    defaultText: "Thinking",
    description: "Status shown while KhasiGPT prepares a chat response.",
    key: "chat.status.thinking",
  };
}

export function ChatThinkingStatus({
  className,
  testId,
}: {
  className?: string;
  testId?: string;
}) {
  const { translate } = useTranslation();
  const [elapsedMs, setElapsedMs] = useState(0);
  const activeCopy = getChatGenerationStatusCopy(elapsedMs);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <AnimatedStatus
      ariaLabel={translate(activeCopy.key, activeCopy.defaultText)}
      className={className}
      label={
        <EditableTranslation
          defaultText={activeCopy.defaultText}
          description={activeCopy.description}
          translationKey={activeCopy.key}
        />
      }
      testId={testId}
    />
  );
}
