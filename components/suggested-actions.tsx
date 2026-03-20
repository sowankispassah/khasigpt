"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { memo } from "react";
import { DEFAULT_SUGGESTED_PROMPTS } from "@/lib/constants";
import type { ChatMessage } from "@/lib/types";
import { Suggestion } from "./elements/suggestion";
import type { VisibilityType } from "./visibility-selector";

type SuggestedActionsProps = {
  chatId: string;
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  selectedVisibilityType: VisibilityType;
  prompts?: string[];
};

function PureSuggestedActions({
  chatId,
  sendMessage,
  prompts,
}: SuggestedActionsProps) {
  const hasPromptsProp = Array.isArray(prompts);
  const normalizedPrompts =
    prompts
      ?.map((prompt) => prompt.trim())
      .filter((prompt) => prompt.length > 0) ?? [];
  if (hasPromptsProp && normalizedPrompts.length === 0) {
    return null;
  }
  const suggestedActions =
    normalizedPrompts.length > 0
      ? normalizedPrompts
      : [...DEFAULT_SUGGESTED_PROMPTS];

  return (
    <div className="flex flex-col gap-3" data-testid="suggested-actions">
      <div className="grid w-full gap-2 sm:grid-cols-2">
        {suggestedActions.map((suggestedAction, index) => (
          <div
            className="w-full"
            key={suggestedAction}
            style={{ animationDelay: `${0.05 * index}s` }}
          >
            <Suggestion
              className="h-auto w-full whitespace-normal p-3 text-left"
              onClick={(suggestion) => {
                window.history.replaceState({}, "", `/chat/${chatId}`);
                sendMessage({
                  role: "user",
                  parts: [{ type: "text", text: suggestion }],
                });
              }}
              suggestion={suggestedAction}
            >
              {suggestedAction}
            </Suggestion>
          </div>
        ))}
      </div>
    </div>
  );
}

export const SuggestedActions = memo(
  PureSuggestedActions,
  (prevProps, nextProps) => {
    if (prevProps.chatId !== nextProps.chatId) {
      return false;
    }
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
      return false;
    }
    const prevPrompts = prevProps.prompts ?? [];
    const nextPrompts = nextProps.prompts ?? [];
    if (prevPrompts.length !== nextPrompts.length) {
      return false;
    }
    for (let index = 0; index < prevPrompts.length; index += 1) {
      if (prevPrompts[index] !== nextPrompts[index]) {
        return false;
      }
    }

    return true;
  }
);
