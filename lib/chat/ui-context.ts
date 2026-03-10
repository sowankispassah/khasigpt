import type { AppUsage, ChatUiContext } from "@/lib/usage";

const EMPTY_UI_CONTEXT: Required<ChatUiContext> = {
  jobPostingId: null,
  studyPaperId: null,
};

function normalizeOptionalId(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function readChatUiContext(context: unknown): Required<ChatUiContext> {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return EMPTY_UI_CONTEXT;
  }

  const rawContext = context as { uiContext?: unknown };
  const rawUiContext = rawContext.uiContext ?? null;
  if (!rawUiContext || typeof rawUiContext !== "object" || Array.isArray(rawUiContext)) {
    return EMPTY_UI_CONTEXT;
  }

  const normalizedUiContext = rawUiContext as ChatUiContext;

  return {
    jobPostingId: normalizeOptionalId(normalizedUiContext.jobPostingId),
    studyPaperId: normalizeOptionalId(normalizedUiContext.studyPaperId),
  };
}

export function mergeChatUiContext({
  currentContext,
  usageContext,
  uiContext,
}: {
  currentContext: AppUsage | null | undefined;
  usageContext?: Partial<AppUsage> | null;
  uiContext: Partial<ChatUiContext>;
}): AppUsage {
  const baseContext =
    currentContext && typeof currentContext === "object" && !Array.isArray(currentContext)
      ? currentContext
      : ({} as AppUsage);
  const currentUiContext = readChatUiContext(baseContext);

  return {
    ...baseContext,
    ...(usageContext ?? {}),
    uiContext: {
      jobPostingId:
        uiContext.jobPostingId !== undefined
          ? normalizeOptionalId(uiContext.jobPostingId)
          : currentUiContext.jobPostingId,
      studyPaperId:
        uiContext.studyPaperId !== undefined
          ? normalizeOptionalId(uiContext.studyPaperId)
          : currentUiContext.studyPaperId,
    },
  };
}
