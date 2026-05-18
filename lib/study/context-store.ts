"use client";

import type { StudyPaperCard } from "@/lib/study/types";

export const STUDY_CONTEXT_STORAGE_KEY = "study-contexts";
export const STUDY_CONTEXT_CHANGE_EVENT = "study-context-change";

export type StudyContextSummary = Partial<
  Pick<StudyPaperCard, "exam" | "role" | "year" | "title">
>;

export type StudyContextMap = Record<string, StudyContextSummary>;

function safeParseMap(value: string | null): StudyContextMap {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as StudyContextMap | null;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

export function readStudyContextMap(): StudyContextMap {
  if (typeof window === "undefined") {
    return {};
  }
  return safeParseMap(window.localStorage.getItem(STUDY_CONTEXT_STORAGE_KEY));
}

export function writeStudyContextMap(map: StudyContextMap): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      STUDY_CONTEXT_STORAGE_KEY,
      JSON.stringify(map)
    );
  } catch {
    // Ignore storage errors.
  }
}

export function getStudyContextForChat(
  chatId?: string | null
): StudyContextSummary | null {
  if (!chatId) {
    return null;
  }
  const map = readStudyContextMap();
  return map[chatId] ?? null;
}

export function setStudyContextForChat(
  chatId: string,
  summary: StudyContextSummary | null
): void {
  if (!chatId) {
    return;
  }
  const map = readStudyContextMap();
  if (!summary) {
    delete map[chatId];
  } else {
    map[chatId] = summary;
  }
  writeStudyContextMap(map);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(STUDY_CONTEXT_CHANGE_EVENT));
  }
}
