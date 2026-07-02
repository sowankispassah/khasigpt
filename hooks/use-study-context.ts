"use client";

import { useEffect, useState } from "react";
import {
  getStudyContextForChat,
  STUDY_CONTEXT_CHANGE_EVENT,
  type StudyContextSummary,
} from "@/lib/study/context-store";

export function useStudyContextSummary(chatId?: string | null) {
  const [summary, setSummary] = useState<StudyContextSummary | null>(() =>
    getStudyContextForChat(chatId)
  );

  useEffect(() => {
    setSummary(getStudyContextForChat(chatId));
  }, [chatId]);

  useEffect(() => {
    const handleChange = () => {
      setSummary(getStudyContextForChat(chatId));
    };

    window.addEventListener(STUDY_CONTEXT_CHANGE_EVENT, handleChange);
    window.addEventListener("storage", handleChange);

    return () => {
      window.removeEventListener(STUDY_CONTEXT_CHANGE_EVENT, handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, [chatId]);

  return summary;
}
