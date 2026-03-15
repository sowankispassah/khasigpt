type StudyQuestionEntry = {
  questionNumber: number;
  question: string;
  options: Record<string, string>;
  inlineAnswers: string[];
};

export type StudyQuestionIndex = {
  entriesByNumber: Map<number, StudyQuestionEntry[]>;
  answersByNumber: Map<number, string[]>;
};

type CachedIndexInput = {
  paperId: string;
  paperVersion: string | null;
  content: string;
};

type LookupQuestionResult =
  | { status: "found"; question: string }
  | { status: "ambiguous" }
  | { status: "not_found" };

type LookupAnswerResult =
  | { status: "found"; answer: string; hasAnyAnswerEvidence: boolean }
  | { status: "ambiguous"; hasAnyAnswerEvidence: boolean }
  | { status: "not_found"; hasAnyAnswerEvidence: boolean };

type StudyNumberIntent =
  | { type: "ask_question_by_number"; questionNumber: number | null }
  | { type: "ask_answer_by_number"; questionNumber: number | null }
  | { type: "other"; questionNumber: number | null };

const MAX_CACHE_ENTRIES = 50;
const questionIndexCache = new Map<string, StudyQuestionIndex>();

function hashContent(content: string) {
  let hash = 2166136261;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

function buildCacheKey(input: CachedIndexInput) {
  return [
    input.paperId,
    input.paperVersion ?? "unknown-version",
    hashContent(input.content),
  ].join(":");
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeAnswerValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const compact = trimmed.replace(/\s+/g, " ");
  const letterMatch = compact.match(/^\(?([A-H])\)?$/i);
  if (letterMatch?.[1]) {
    return letterMatch[1].toUpperCase();
  }
  return compact;
}

function extractOptionsFromQuestion(questionText: string): Record<string, string> {
  const options: Record<string, string> = {};
  const optionPattern = /\(([A-H])\)\s*([^()]+?)(?=\s*\([A-H]\)|$)/gi;

  for (const match of questionText.matchAll(optionPattern)) {
    const key = match[1]?.toUpperCase();
    const value = match[2]?.replace(/\s+/g, " ").trim();
    if (key && value) {
      options[key] = value;
    }
  }
  return options;
}

function isLikelyQuestionStart(restText: string) {
  const trimmed = restText.trim();
  if (!trimmed) {
    return true;
  }
  if (/^\(?[A-H]\)?$/i.test(trimmed)) {
    return false;
  }
  if (/^[A-H][).:-]?\s*$/i.test(trimmed)) {
    return false;
  }
  return true;
}

function extractInlineAnswers(questionText: string): string[] {
  const values: string[] = [];
  const answerPattern =
    /\b(?:answer|ans(?:wer)?|correct answer)\s*[:\-]\s*(\(?[A-H]\)?|[^\n.]+)/gi;

  for (const match of questionText.matchAll(answerPattern)) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }
    const normalized = normalizeAnswerValue(raw);
    if (normalized) {
      values.push(normalized);
    }
  }

  return values;
}

function parseQuestionEntries(content: string): StudyQuestionEntry[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const entries: StudyQuestionEntry[] = [];

  let activeNumber: number | null = null;
  let activeLines: string[] = [];

  const flush = () => {
    if (!activeNumber) {
      return;
    }
    const questionText = activeLines.join("\n").trim();
    if (!questionText) {
      activeNumber = null;
      activeLines = [];
      return;
    }
    const options = extractOptionsFromQuestion(questionText);
    const inlineAnswers = extractInlineAnswers(questionText);
    entries.push({
      questionNumber: activeNumber,
      question: questionText,
      options,
      inlineAnswers,
    });
    activeNumber = null;
    activeLines = [];
  };

  const questionStartPattern =
    /^\s*(?:q(?:uestion)?\s*)?(\d{1,3})\s*[:.)-]?\s*(.*)$/i;

  for (const line of lines) {
    const trimmedLine = line.trim();

    const questionStart = line.match(questionStartPattern);

    if (questionStart?.[1]) {
      const questionNumber = Number.parseInt(questionStart[1], 10);
      const rest = questionStart[2] ?? "";
      if (Number.isFinite(questionNumber) && questionNumber > 0) {
        if (isLikelyQuestionStart(rest)) {
          flush();
          activeNumber = questionNumber;
          activeLines = rest.trim() ? [rest.trim()] : [];
          continue;
        }
      }
    }

    if (
      activeNumber &&
      /^(?:answer key|answers?)\b/i.test(trimmedLine)
    ) {
      flush();
      continue;
    }

    if (
      activeNumber &&
      /^(\d{1,3})\s*[-=:.)]\s*\(?[A-H]\)?$/i.test(trimmedLine)
    ) {
      flush();
      continue;
    }

    if (activeNumber) {
      if (!trimmedLine) {
        if (activeLines.at(-1) !== "") {
          activeLines.push("");
        }
        continue;
      }
      activeLines.push(trimmedLine);
    }
  }

  flush();
  return entries;
}

function parseAnswerKeyMap(content: string): Map<number, string[]> {
  const map = new Map<number, string[]>();
  const lines = content.replace(/\r\n/g, "\n").split("\n");

  const push = (questionNumber: number, rawAnswer: string) => {
    const answer = normalizeAnswerValue(rawAnswer);
    if (!answer) {
      return;
    }
    const existing = map.get(questionNumber) ?? [];
    existing.push(answer);
    map.set(questionNumber, existing);
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.length > 80) {
      continue;
    }

    const compactMatch = line.match(/^(\d{1,3})\s*[-=:]\s*\(?([A-H])\)?$/i);
    if (compactMatch?.[1] && compactMatch[2]) {
      push(Number.parseInt(compactMatch[1], 10), compactMatch[2]);
      continue;
    }

    const prefixedMatch = line.match(
      /^(?:q(?:uestion)?\s*)?(\d{1,3})\s*[.):-]\s*\(?([A-H])\)?\b/i
    );
    if (prefixedMatch?.[1] && prefixedMatch[2]) {
      push(Number.parseInt(prefixedMatch[1], 10), prefixedMatch[2]);
      continue;
    }
  }

  return map;
}

function buildQuestionIndex(content: string): StudyQuestionIndex {
  const entries = parseQuestionEntries(content);
  const answersByNumber = parseAnswerKeyMap(content);
  const entriesByNumber = new Map<number, StudyQuestionEntry[]>();

  for (const entry of entries) {
    const list = entriesByNumber.get(entry.questionNumber) ?? [];
    list.push(entry);
    entriesByNumber.set(entry.questionNumber, list);

    if (entry.inlineAnswers.length > 0) {
      const existing = answersByNumber.get(entry.questionNumber) ?? [];
      answersByNumber.set(entry.questionNumber, [...existing, ...entry.inlineAnswers]);
    }
  }

  return { entriesByNumber, answersByNumber };
}

export function getStudyQuestionIndexCached(
  input: CachedIndexInput
): StudyQuestionIndex {
  const key = buildCacheKey(input);
  const cached = questionIndexCache.get(key);
  if (cached) {
    return cached;
  }

  const index = buildQuestionIndex(input.content);
  questionIndexCache.set(key, index);

  if (questionIndexCache.size > MAX_CACHE_ENTRIES) {
    const oldest = questionIndexCache.keys().next().value;
    if (oldest) {
      questionIndexCache.delete(oldest);
    }
  }

  return index;
}

export function lookupStudyQuestionByNumber(
  questionIndex: StudyQuestionIndex,
  questionNumber: number
): LookupQuestionResult {
  const entries = questionIndex.entriesByNumber.get(questionNumber) ?? [];
  if (entries.length === 0) {
    return { status: "not_found" };
  }

  const uniqueByText = new Map<string, StudyQuestionEntry>();
  for (const entry of entries) {
    uniqueByText.set(normalizeText(entry.question), entry);
  }

  const uniqueEntries = Array.from(uniqueByText.values());
  if (uniqueEntries.length > 1) {
    return { status: "ambiguous" };
  }

  return { status: "found", question: uniqueEntries[0].question };
}

function formatAnswerForQuestion(
  answer: string,
  entry: StudyQuestionEntry | null
): string {
  const letterMatch = answer.match(/^[A-H]$/);
  if (!letterMatch?.[0] || !entry) {
    return answer;
  }
  const optionLetter = letterMatch[0];
  const optionText = entry.options[optionLetter];
  if (!optionText) {
    return optionLetter;
  }
  return `(${optionLetter}) ${optionText}`;
}

export function lookupStudyAnswerByNumber(
  questionIndex: StudyQuestionIndex,
  questionNumber: number
): LookupAnswerResult {
  const answerCandidates = questionIndex.answersByNumber.get(questionNumber) ?? [];
  const normalizedAnswerCandidates = answerCandidates
    .map(normalizeAnswerValue)
    .filter(Boolean);

  if (normalizedAnswerCandidates.length === 0) {
    return { status: "not_found", hasAnyAnswerEvidence: false };
  }

  const uniqueAnswers = Array.from(new Set(normalizedAnswerCandidates));
  if (uniqueAnswers.length > 1) {
    return { status: "ambiguous", hasAnyAnswerEvidence: true };
  }

  const entry = (questionIndex.entriesByNumber.get(questionNumber) ?? [])[0] ?? null;
  const answer = formatAnswerForQuestion(uniqueAnswers[0], entry);
  return {
    status: "found",
    answer,
    hasAnyAnswerEvidence: true,
  };
}

export function resolveQuestionNumberFromText(text: string): number | null {
  const patterns = [
    /\bquestion\s*(?:number\s*)?(\d{1,3})\b/i,
    /\bq\s*(\d{1,3})\b/i,
    /\b(\d{1,3})(?:st|nd|rd|th)?\s*question\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const token = match?.[1];
    if (!token) {
      continue;
    }
    const parsed = Number.parseInt(token, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

export function resolveStudyNumberIntent(text: string): StudyNumberIntent {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return { type: "other", questionNumber: null };
  }

  const questionNumber = resolveQuestionNumberFromText(normalized);
  const asksForAnswer =
    /\b(answer|ans|correct option|correct answer|solution)\b/.test(normalized) ||
    /^a\s*\d+\b/.test(normalized) ||
    /\bwhat is the answer\b/.test(normalized);
  const asksForQuestion =
    /\b(question|ques|qn)\b/.test(normalized) ||
    /^q\s*\d+\b/.test(normalized);

  if (asksForAnswer) {
    return { type: "ask_answer_by_number", questionNumber };
  }
  if (asksForQuestion && questionNumber) {
    return { type: "ask_question_by_number", questionNumber };
  }

  return { type: "other", questionNumber };
}
