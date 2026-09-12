"use client";

import { AnimatedStatus } from "@/components/animated-status";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";

export function ChatThinkingStatus({
  className,
  testId,
}: {
  className?: string;
  testId?: string;
}) {
  const { translate } = useTranslation();
  const defaultText = "Thinking";
  const translationKey = "chat.status.thinking";

  return (
    <AnimatedStatus
      ariaLabel={translate(translationKey, defaultText)}
      className={className}
      label={
        <EditableTranslation
          defaultText={defaultText}
          description="Status shown while KhasiGPT prepares a chat response."
          translationKey={translationKey}
        />
      }
      testId={testId}
    />
  );
}
