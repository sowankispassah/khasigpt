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

function readNamedChatUiContext(
  context: unknown,
  key: "uiContext" | "originUiContext"
): Required<ChatUiContext> {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    return EMPTY_UI_CONTEXT;
  }

  const rawContext = context as {
    originUiContext?: unknown;
    uiContext?: unknown;
  };
  const rawUiContext = rawContext[key] ?? null;
  if (!rawUiContext || typeof rawUiContext !== "object" || Array.isArray(rawUiContext)) {
    return EMPTY_UI_CONTEXT;
  }

  const normalizedUiContext = rawUiContext as ChatUiContext;

  return {
    jobPostingId: normalizeOptionalId(normalizedUiContext.jobPostingId),
    studyPaperId: normalizeOptionalId(normalizedUiContext.studyPaperId),
  };
}

export function readChatUiContext(context: unknown): Required<ChatUiContext> {
  return readNamedChatUiContext(context, "uiContext");
}

export function readChatOriginUiContext(
  context: unknown
): Required<ChatUiContext> {
  return readNamedChatUiContext(context, "originUiContext");
}

export function mergeChatUiContext({
  currentContext,
  usageContext,
  originUiContext,
  uiContext,
}: {
  currentContext: AppUsage | null | undefined;
  usageContext?: Partial<AppUsage> | null;
  originUiContext?: Partial<ChatUiContext>;
  uiContext: Partial<ChatUiContext>;
}): AppUsage {
  const baseContext =
    currentContext && typeof currentContext === "object" && !Array.isArray(currentContext)
      ? currentContext
      : ({} as AppUsage);
  const currentUiContext = readChatUiContext(baseContext);
  const currentOriginUiContext = readChatOriginUiContext(baseContext);

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
    originUiContext: {
      jobPostingId:
        originUiContext?.jobPostingId !== undefined
          ? currentOriginUiContext.jobPostingId ??
            normalizeOptionalId(originUiContext.jobPostingId)
          : currentOriginUiContext.jobPostingId,
      studyPaperId:
        originUiContext?.studyPaperId !== undefined
          ? currentOriginUiContext.studyPaperId ??
            normalizeOptionalId(originUiContext.studyPaperId)
          : currentOriginUiContext.studyPaperId,
    },
  };
}
