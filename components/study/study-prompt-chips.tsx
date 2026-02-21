"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Suggestions, Suggestion } from "@/components/elements/suggestion";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "@/lib/types";
import { fetcher } from "@/lib/utils";
import type { StudyChipGroup } from "@/lib/study/types";

const DEFAULT_ACTIONS = [
  "Previous year papers",
  "Start quiz",
  "Syllabus",
];

type StudyPromptChipsProps = {
  chatId: string;
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  assistChips?: { question: string; chips: string[] } | null;
};

export function StudyPromptChips({
  chatId,
  sendMessage,
  assistChips,
}: StudyPromptChipsProps) {
  const [selectedExam, setSelectedExam] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  useEffect(() => {
    setSelectedExam(null);
    setSelectedRole(null);
  }, [chatId]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedExam) {
      params.set("exam", selectedExam);
    }
    if (selectedRole) {
      params.set("role", selectedRole);
    }
    const qs = params.toString();
    return `/api/study/chips${qs ? `?${qs}` : ""}`;
  }, [selectedExam, selectedRole]);

  const { data } = useSWR<{ groups: StudyChipGroup[]; actions: string[] }>(
    query,
    fetcher
  );

  const actionChips = data?.actions ?? DEFAULT_ACTIONS;
  const groups = data?.groups ?? [];
  const activeGroup = groups[0];
  const showActiveGroup = Boolean(activeGroup && !assistChips);

  const handleSend = useCallback(
    (text: string) => {
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", `/chat/${chatId}`);
      }
      sendMessage({
        role: "user",
        parts: [{ type: "text", text }],
      });
    },
    [chatId, sendMessage]
  );

  const handleChipClick = useCallback(
    (chip: string) => {
      if (!activeGroup) {
        handleSend(chip);
        return;
      }

      if (activeGroup.label === "Exams") {
        setSelectedExam(chip);
        setSelectedRole(null);
        handleSend(chip);
        return;
      }

      if (activeGroup.label === "Roles") {
        setSelectedRole(chip);
        handleSend(chip);
        return;
      }

      handleSend(chip);
    },
    [activeGroup, handleSend]
  );

  const handleReset = useCallback(() => {
    setSelectedExam(null);
    setSelectedRole(null);
  }, []);

  return (
    <div className="rounded-2xl border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Study prompts
        </div>
        {selectedExam ? (
          <Button
            className="cursor-pointer"
            onClick={handleReset}
            size="sm"
            type="button"
            variant="ghost"
          >
            Change exam
          </Button>
        ) : null}
      </div>
      <div className="mt-2 flex flex-col gap-3">
        <Suggestions>
          {actionChips.map((action) => (
            <Suggestion
              key={action}
              onClick={() => handleSend(action)}
              suggestion={action}
            >
              {action}
            </Suggestion>
          ))}
        </Suggestions>
        {assistChips && assistChips.chips.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="text-xs font-medium text-muted-foreground">
              {assistChips.question}
            </div>
            <Suggestions>
              {assistChips.chips.map((chip) => (
                <Suggestion
                  key={chip}
                  onClick={() => handleChipClick(chip)}
                  suggestion={chip}
                >
                  {chip}
                </Suggestion>
              ))}
            </Suggestions>
          </div>
        ) : null}
        {showActiveGroup && activeGroup && activeGroup.chips.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="text-xs font-medium text-muted-foreground">
              {activeGroup.label}
            </div>
            <Suggestions>
              {activeGroup.chips.map((chip) => (
                <Suggestion
                  key={chip}
                  onClick={() => handleChipClick(chip)}
                  suggestion={chip}
                >
                  {chip}
                </Suggestion>
              ))}
            </Suggestions>
          </div>
        ) : null}
      </div>
    </div>
  );
}
