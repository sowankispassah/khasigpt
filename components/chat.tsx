"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BookOpen } from "lucide-react";
import useSWR, { useSWRConfig } from "swr";
import { unstable_serialize } from "swr/infinite";
import { saveChatModelAsCookie } from "@/app/(chat)/actions";
import { ChatHeader } from "@/components/chat-header";
import { useTranslation } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LanguageOption } from "@/lib/i18n/languages";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAutoResume } from "@/hooks/use-auto-resume";
import { useChatVisibility } from "@/hooks/use-chat-visibility";
import { CHAT_HISTORY_PAGE_SIZE } from "@/lib/constants";
import type { Vote } from "@/lib/db/schema";
import type {
  IconPromptAction,
  IconPromptSuggestion,
} from "@/lib/icon-prompts";
import type { StudyPaperCard, StudyQuestionReference } from "@/lib/study/types";
import type { Attachment, ChatMessage } from "@/lib/types";
import { fetcher, fetchWithErrorHandlers, generateUUID } from "@/lib/utils";
import {
  getStudyContextForChat,
  setStudyContextForChat,
} from "@/lib/study/context-store";
import { useDataStream } from "./data-stream-provider";
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input";
import { StudyPromptChips } from "./study/study-prompt-chips";
import { getChatHistoryPaginationKeyForMode } from "./sidebar-history";
import { toast } from "./toast";
import type { VisibilityType } from "./visibility-selector";

const MODEL_STORAGE_KEY = "chat-model-preference";
const LANGUAGE_STORAGE_KEY = "chat-language-preference";
const CHAT_LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const buildStudyQuestionReference = (
  paper: StudyPaperCard
): StudyQuestionReference => ({
  paperId: paper.id,
  title: paper.title,
  preview: `${paper.exam} / ${paper.role} / ${paper.year}`,
});

export function Chat({
  id,
  initialMessages,
  initialHasMoreHistory,
  initialOldestMessageAt,
  initialChatModel,
  initialChatLanguage,
  initialVisibilityType,
  chatMode,
  languageSettings,
  isReadonly,
  autoResume,
  suggestedPrompts,
  iconPromptActions = [],
  imageGeneration,
  documentUploadsEnabled,
  customKnowledgeEnabled: _customKnowledgeEnabled,
}: {
  id: string;
  initialMessages: ChatMessage[];
  initialHasMoreHistory: boolean;
  initialOldestMessageAt: string | null;
  initialChatModel: string;
  initialChatLanguage: string;
  initialVisibilityType: VisibilityType;
  chatMode: "default" | "study";
  languageSettings?: LanguageOption[];
  isReadonly: boolean;
  autoResume: boolean;
  suggestedPrompts: string[];
  iconPromptActions?: IconPromptAction[];
  imageGeneration: {
    enabled: boolean;
    canGenerate: boolean;
    requiresPaidCredits: boolean;
  };
  documentUploadsEnabled: boolean;
  customKnowledgeEnabled: boolean;
}) {
  const historyMode = chatMode === "study" ? "study" : "default";
  const historyPaginationKey = useMemo(
    () => getChatHistoryPaginationKeyForMode(historyMode),
    [historyMode]
  );
  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
    historyMode,
  });
  const {
    translate,
    languages,
    activeLanguage,
    setLanguage,
    isUpdating: isUiLanguageUpdating,
  } = useTranslation();

  const { mutate } = useSWRConfig();
  const { setDataStream } = useDataStream();

  const isStudyMode = chatMode === "study";
  const greetingSubtitle = isStudyMode
    ? translate("greeting.study.subtitle", "What would you like to study today?")
    : undefined;
  const [input, setInput] = useState<string>("");
  const [showCreditCardAlert, setShowCreditCardAlert] = useState(false);
  const [showRechargeDialog, setShowRechargeDialog] = useState(false);
  const [showImageUpgradeDialog, setShowImageUpgradeDialog] = useState(false);
  const [currentModelId, setCurrentModelId] = useState(initialChatModel);
  const currentModelIdRef = useRef(currentModelId);
  const [currentLanguageCode, setCurrentLanguageCode] = useState(
    initialChatLanguage
  );
  const currentLanguageCodeRef = useRef(currentLanguageCode);
  const studyContextIdRef = useRef<string | null>(null);
  const studyQuizActiveRef = useRef(false);
  const [pendingUiLanguage, setPendingUiLanguage] = useState<{
    code: string;
    name: string;
  } | null>(null);
  const [uiLanguageTarget, setUiLanguageTarget] = useState<string | null>(
    null
  );
  const [isImageMode, setIsImageMode] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [showActionProgress, setShowActionProgress] = useState(false);
  const [actionProgress, setActionProgress] = useState(0);
  const progressTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [hasMoreHistory, setHasMoreHistory] = useState(
    initialHasMoreHistory
  );
  const [oldestMessageAt, setOldestMessageAt] = useState(
    initialOldestMessageAt
  );
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [studyContext, setStudyContext] = useState<StudyPaperCard | null>(null);
  const [studyQuizActive, setStudyQuizActive] = useState(false);
  const [studyQuestionReference, setStudyQuestionReference] =
    useState<StudyQuestionReference | null>(null);
  const [studyViewerPaper, setStudyViewerPaper] =
    useState<StudyPaperCard | null>(null);
  const imageUpgradeTitle = imageGeneration.requiresPaidCredits
    ? translate(
        "image.actions.locked.free.title",
        "Free credits can't be used for images"
      )
    : translate(
        "image.actions.locked.title",
        "Recharge credits to generate images"
      );
  const imageUpgradeDescription = imageGeneration.requiresPaidCredits
    ? translate(
        "image.actions.locked.free.description",
        "You are using free credits. Recharge to generate images."
      )
    : translate(
        "image.actions.locked.description",
        "Image generation is available for paid plans or users with active credits."
      );

  useEffect(() => {
    currentModelIdRef.current = currentModelId;
  }, [currentModelId]);

  useEffect(() => {
    currentLanguageCodeRef.current = currentLanguageCode;
  }, [currentLanguageCode]);

  useEffect(() => {
    studyContextIdRef.current = studyContext?.id ?? null;
  }, [studyContext]);

  useEffect(() => {
    if (!isStudyMode) {
      return;
    }
    if (!studyContext) {
      setStudyContextForChat(id, null);
      return;
    }
    setStudyContextForChat(id, {
      exam: studyContext.exam,
      role: studyContext.role,
      year: studyContext.year,
      title: studyContext.title,
    });
  }, [id, isStudyMode, studyContext]);

  useEffect(() => {
    studyQuizActiveRef.current = studyQuizActive;
  }, [studyQuizActive]);

  const handleModelChange = useCallback((modelId: string) => {
    setCurrentModelId(modelId);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(MODEL_STORAGE_KEY, modelId);
      } catch {
        // Ignore storage errors (private mode, quotas).
      }
    }
    startTransition(() => {
      saveChatModelAsCookie(modelId);
    });
  }, []);

  const setChatLanguageCookie = useCallback((languageCode: string) => {
    if (typeof document === "undefined") {
      return;
    }
    const encoded = encodeURIComponent(languageCode);
    document.cookie = `chat-language=${encoded}; path=/; max-age=${CHAT_LANGUAGE_COOKIE_MAX_AGE}; samesite=lax`;
  }, []);

  const handleLanguageChange = useCallback(
    (languageCode: string, promptUiChange = false) => {
      const normalized = languageCode.trim().toLowerCase();
      if (!normalized) {
        return;
      }
      const languageOptions =
        languageSettings && languageSettings.length > 0
          ? languageSettings
          : languages;
      const selectedLanguage =
        languageOptions.find((language) => language.code === normalized) ??
        languages.find((language) => language.code === normalized);
      const shouldPromptUiChange =
        promptUiChange &&
        Boolean(selectedLanguage?.syncUiLanguage) &&
        activeLanguage.code !== normalized;
      if (
        normalized === currentLanguageCodeRef.current &&
        !shouldPromptUiChange
      ) {
        return;
      }
      if (normalized !== currentLanguageCodeRef.current) {
        setCurrentLanguageCode(normalized);
      }
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
        } catch {
          // Ignore storage errors (private mode, quotas).
        }
      }
      setChatLanguageCookie(normalized);
      if (shouldPromptUiChange && selectedLanguage) {
        setPendingUiLanguage({
          code: selectedLanguage.code,
          name: selectedLanguage.name,
        });
      } else {
        setPendingUiLanguage(null);
      }
    },
    [activeLanguage.code, languageSettings, languages, setChatLanguageCookie]
  );

  const handleLanguageChangeFromInput = useCallback(
    (languageCode: string) => {
      handleLanguageChange(languageCode, true);
    },
    [handleLanguageChange]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ code?: string }>).detail;
      if (!detail?.code) {
        return;
      }
      handleLanguageChange(detail.code, false);
    };
    window.addEventListener("chat-language-change", handler);
    return () => window.removeEventListener("chat-language-change", handler);
  }, [handleLanguageChange]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const storedModelId = localStorage.getItem(MODEL_STORAGE_KEY);
      if (storedModelId && storedModelId !== currentModelId) {
        handleModelChange(storedModelId);
      }
    } catch {
      // Ignore storage errors.
    }
  }, [currentModelId, handleModelChange]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const storedLanguageCode = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (
        storedLanguageCode &&
        storedLanguageCode !== currentLanguageCode
      ) {
        handleLanguageChange(storedLanguageCode, false);
      }
    } catch {
      // Ignore storage errors.
    }
  }, [currentLanguageCode, handleLanguageChange]);

  useEffect(() => {
    setHasMoreHistory(initialHasMoreHistory);
    setOldestMessageAt(initialOldestMessageAt);
    setIsLoadingHistory(false);
  }, [initialHasMoreHistory, initialOldestMessageAt]);

  useEffect(() => {
    if (!isStudyMode) {
      setStudyContext(null);
      setStudyQuizActive(false);
      setStudyQuestionReference(null);
      setStudyViewerPaper(null);
      return;
    }
    setStudyContext(null);
    setStudyQuizActive(false);
    setStudyViewerPaper(null);
  }, [id, isStudyMode]);

  useEffect(() => {
    if (!languages.length) {
      return;
    }
    const exists = languages.some(
      (language) => language.code === currentLanguageCode
    );
    if (exists) {
      return;
    }
    const fallbackCode = activeLanguage?.code ?? languages[0]?.code ?? null;
    if (fallbackCode && fallbackCode !== currentLanguageCode) {
      handleLanguageChange(fallbackCode, false);
    }
  }, [
    activeLanguage?.code,
    currentLanguageCode,
    handleLanguageChange,
    languages,
  ]);

  useEffect(() => {
    if (!imageGeneration.enabled || isStudyMode) {
      setIsImageMode(false);
    }
  }, [imageGeneration.enabled, isStudyMode]);

  const clearProgressTimers = useCallback(() => {
    for (const timerId of progressTimersRef.current) {
      clearTimeout(timerId);
    }
    progressTimersRef.current = [];
  }, []);

  const startActionProgress = useCallback(() => {
    clearProgressTimers();
    setShowActionProgress(true);
    setActionProgress(12);
    const timers = [
      setTimeout(() => setActionProgress(40), 120),
      setTimeout(() => setActionProgress(70), 260),
      setTimeout(() => setActionProgress(90), 520),
    ];
    progressTimersRef.current = timers;
  }, [clearProgressTimers]);

  useEffect(() => {
    return () => {
      clearProgressTimers();
    };
  }, [clearProgressTimers]);

  useEffect(() => {
    if (!uiLanguageTarget) {
      return;
    }
    if (activeLanguage.code !== uiLanguageTarget) {
      return;
    }
    if (isUiLanguageUpdating) {
      return;
    }

    setActionProgress(100);
    const timer = setTimeout(() => {
      clearProgressTimers();
      setShowActionProgress(false);
      setActionProgress(0);
      setUiLanguageTarget(null);
    }, 180);

    return () => clearTimeout(timer);
  }, [
    activeLanguage.code,
    clearProgressTimers,
    isUiLanguageUpdating,
    uiLanguageTarget,
  ]);

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    resumeStream,
  } = useChat<ChatMessage>({
    id,
    messages: initialMessages,
    experimental_throttle: 100,
    generateId: generateUUID,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      fetch: fetchWithErrorHandlers,
      prepareSendMessagesRequest(request) {
        const studyPayload = isStudyMode
          ? {
              chatMode,
              studyPaperId: studyContextIdRef.current,
              studyQuizActive: studyQuizActiveRef.current,
            }
          : { chatMode: "default" };
        return {
          body: {
            id: request.id,
            message: request.messages.at(-1),
            selectedChatModel: currentModelIdRef.current,
            selectedLanguage: currentLanguageCodeRef.current,
            selectedVisibilityType: visibilityType,
            ...request.body,
            ...studyPayload,
          },
        };
      },
    }),
    onData: (dataPart) => {
      setDataStream((ds) => (ds ? [...ds, dataPart] : []));
    },
    onFinish: () => {
      mutate(unstable_serialize(historyPaginationKey));
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : String(error ?? "");
      const normalized = message.toLowerCase();

      const isCreditError =
        normalized.includes("recharge") || normalized.includes("credit");

      if (isCreditError) {
        setMessages((prev) => {
          if (!prev.length) {
            return prev;
          }
          const next = [...prev];
          const last = next.at(-1);
          if (last?.role === "user") {
            next.pop();
          }
          return next;
        });

        setInput("");
        setAttachments([]);

        if (messages.length <= 1) {
          router.replace("/", { scroll: false });
          if (typeof window !== "undefined") {
            window.history.replaceState({}, "", "/");
          }
        }

        setShowRechargeDialog(true);
        return;
      }

      if (message.includes("AI Gateway requires a valid credit card")) {
        setShowCreditCardAlert(true);
        return;
      }

      if (message.includes("credits") && message.includes("recharge")) {
        setShowRechargeDialog(true);
        return;
      }

      if (message) {
        toast({
          type: "error",
          description: message,
        });
      }
    },
  });

  useEffect(() => {
    if (!isStudyMode) {
      return;
    }
    const lastUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");
    if (!lastUserMessage) {
      return;
    }
    const text = (lastUserMessage.parts ?? [])
      .filter(
        (part): part is { type: "text"; text: string } => part.type === "text"
      )
      .map((part) => part.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text) {
      return;
    }
    const normalized =
      text.length > 80 ? `${text.slice(0, 77).trim()}...` : text;
    const existing = getStudyContextForChat(id);
    if (existing?.title === normalized) {
      return;
    }
    setStudyContextForChat(id, {
      ...existing,
      title: normalized,
    });
  }, [id, isStudyMode, messages]);

  const studyAssistChips = useMemo(() => {
    if (!isStudyMode) {
      return null;
    }
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const entry = messages[index];
      if (entry.role !== "assistant") {
        continue;
      }
      const dataPart = entry.parts.find(
        (part) => part.type === "data-studyAssistChips"
      ) as
        | { data?: { question?: string; chips?: string[] } }
        | undefined;
      if (dataPart?.data?.question && dataPart.data.chips?.length) {
        return {
          question: dataPart.data.question,
          chips: dataPart.data.chips,
        };
      }
    }
    return null;
  }, [isStudyMode, messages]);

  const handleStudyView = useCallback((paper: StudyPaperCard) => {
    setStudyViewerPaper(paper);
  }, []);

  const handleStudyAsk = useCallback((paper: StudyPaperCard) => {
    setStudyContext(paper);
    setStudyQuizActive(false);
    setStudyQuestionReference(buildStudyQuestionReference(paper));
  }, []);

  const handleStudyQuiz = useCallback(
    (paper: StudyPaperCard) => {
      if (status !== "ready") {
        return;
      }
      const reference = buildStudyQuestionReference(paper);
      setStudyContext(paper);
      setStudyQuizActive(true);
      setStudyQuestionReference(reference);
      sendMessage({
        role: "user",
        parts: [
          {
            type: "data-studyQuestionReference",
            data: reference,
          },
          { type: "text", text: "Start quiz" },
        ],
      });
    },
    [sendMessage, status]
  );

  const handleJumpToQuestionPaper = useCallback((paperId: string) => {
    if (typeof document === "undefined") {
      return;
    }

    const escapedPaperId =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(paperId)
        : paperId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

    const targetCard = document.querySelector<HTMLElement>(
      `[data-study-paper-card-id="${escapedPaperId}"]`
    );
    const fallbackList =
      document.querySelector<HTMLElement>('[data-study-papers-list="true"]');
    const target = targetCard ?? fallbackList;

    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.classList.add("ring-2", "ring-primary/40");
    window.setTimeout(() => {
      target.classList.remove("ring-2", "ring-primary/40");
    }, 1200);
  }, []);

  const clearStudyContext = useCallback(() => {
    setStudyContext(null);
    setStudyQuizActive(false);
    setStudyQuestionReference(null);
  }, []);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.get("query");
  const newChatNonce = searchParams.get("new");

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      sendMessage({
        role: "user" as const,
        parts: [{ type: "text", text: query }],
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, "", `/chat/${id}`);
    }
  }, [query, sendMessage, hasAppendedQuery, id]);

  useEffect(() => {
    if ((pathname === "/" || pathname === "/chat") && newChatNonce) {
      const nextPath = pathname === "/chat" ? "/chat" : "/";
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("new");
      const nextHref = nextParams.toString()
        ? `${nextPath}?${nextParams.toString()}`
        : nextPath;
      router.replace(nextHref, { scroll: false });
    }
  }, [newChatNonce, pathname, router, searchParams]);

  const { data: votes } = useSWR<Vote[]>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher
  );

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const isArtifactVisible = false;
  const [iconPromptSuggestions, setIconPromptSuggestions] = useState<
    IconPromptSuggestion[]
  >([]);
  const handleIconPromptSelect = useCallback(
    (item: IconPromptAction) => {
      const trimmedPrompt = item.prompt.trim();
      if (item.showSuggestions && item.suggestions.length > 0) {
        setIconPromptSuggestions(item.suggestions);
      } else {
        setIconPromptSuggestions([]);
        if (trimmedPrompt) {
          setInput((current) => {
            const existing = current ?? "";
            if (item.behavior === "append" && existing.trim().length > 0) {
              const separator = existing.endsWith(" ") ? "" : " ";
              return `${existing}${separator}${trimmedPrompt}`;
            }
            return trimmedPrompt;
          });
        }
      }

      if (item.selectImageMode) {
        if (!imageGeneration.enabled) {
          return;
        }
        if (!imageGeneration.canGenerate) {
          setShowImageUpgradeDialog(true);
          return;
        }
        setIsImageMode(true);
      } else {
        setIsImageMode(false);
      }
    },
    [imageGeneration.canGenerate, imageGeneration.enabled]
  );

  const generateImageFromPrompt = useCallback(
    async (prompt: string, displayPrompt?: string) => {
      if (!imageGeneration.enabled) {
        toast({
          type: "error",
          description: translate(
            "image.disabled",
            "Image generation is currently unavailable."
          ),
        });
        return;
      }
      if (!imageGeneration.canGenerate) {
        setShowImageUpgradeDialog(true);
        return;
      }

      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt) {
        toast({
          type: "error",
          description: translate(
            "image.prompt.required",
            "Add a prompt before generating."
          ),
        });
        return;
      }

      const displayText =
        (displayPrompt ?? "").trim() || trimmedPrompt;
      const imageAttachments = attachments.filter((attachment) =>
        attachment.contentType?.startsWith("image/")
      );

      window.history.replaceState({}, "", `/chat/${id}`);

      const userMessageId = generateUUID();
      const userParts = [
        ...imageAttachments.map((attachment) => ({
          type: "file" as const,
          url: attachment.url,
          filename: attachment.name,
          mediaType: attachment.contentType,
        })),
        { type: "text" as const, text: displayText },
      ];

      setMessages((prev) => [
        ...prev,
        {
          id: userMessageId,
          role: "user",
          parts: userParts,
        },
      ]);

      setInput("");
      setAttachments([]);
      setIsGeneratingImage(true);

      try {
        const response = await fetch("/api/images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: id,
            visibility: visibilityType,
            prompt: trimmedPrompt,
            displayPrompt: displayText,
            userMessageId,
            imageUrls: imageAttachments.map((attachment) => attachment.url),
          }),
        });

        const data = (await response.json().catch(() => null)) as
          | {
              assistantMessage?: ChatMessage;
              message?: string;
            }
          | null;

        if (!response.ok) {
          if (response.status === 402) {
            setMessages((prev) =>
              prev.filter((message) => message.id !== userMessageId)
            );
            setShowImageUpgradeDialog(true);
            return;
          }

          toast({
            type: "error",
            description:
              data?.message ??
              translate(
                "image.generate.failed",
                "Image generation failed. Please try again."
              ),
          });
          return;
        }

        const assistantMessage = data?.assistantMessage;
        if (!assistantMessage) {
          toast({
            type: "error",
            description: translate(
              "image.generate.empty",
              "No image was returned. Try a different prompt."
            ),
          });
          return;
        }

        setMessages((prev) => [...prev, assistantMessage]);
        mutate(unstable_serialize(historyPaginationKey));
      } catch (_error) {
        toast({
          type: "error",
          description: translate(
            "image.generate.failed",
            "Image generation failed. Please try again."
          ),
        });
      } finally {
        setIsGeneratingImage(false);
      }
    },
    [
      attachments,
      historyPaginationKey,
      id,
      imageGeneration.canGenerate,
      imageGeneration.enabled,
      mutate,
      setMessages,
      translate,
      visibilityType,
    ]
  );

  const handleIconPromptSuggestionSelect = useCallback(
    (suggestion: IconPromptSuggestion) => {
      const visibleText = suggestion.label.trim();
      const trimmed = suggestion.prompt.trim();
      const hiddenText = trimmed || visibleText;
      if (!hiddenText) {
        return;
      }
      if ((status !== "ready" && status !== "error") || isGeneratingImage) {
        return;
      }

      setIconPromptSuggestions([]);

      const displayedPrompt = visibleText || hiddenText;
      if (suggestion.isEditable) {
        setInput(displayedPrompt);
        return;
      }

      if (isImageMode) {
        void generateImageFromPrompt(hiddenText, visibleText);
        return;
      }

      window.history.replaceState({}, "", `/chat/${id}`);

      const messageParts = [
        ...attachments.map((attachment) => ({
          type: "file" as const,
          url: attachment.url,
          name: attachment.name,
          mediaType: attachment.contentType,
        })),
        { type: "text" as const, text: displayedPrompt },
      ];

      sendMessage(
        {
          role: "user",
          parts: messageParts,
        },
        hiddenText !== displayedPrompt
          ? { body: { hiddenPrompt: hiddenText } }
          : undefined
      );

      setInput("");
      setAttachments([]);
    },
    [
      attachments,
      generateImageFromPrompt,
      id,
      isGeneratingImage,
      isImageMode,
      sendMessage,
      status,
    ]
  );

  useEffect(() => {
    setIconPromptSuggestions([]);
  }, []);

  const loadOlderMessages = useCallback(async () => {
    if (isLoadingHistory || !hasMoreHistory) {
      return;
    }

    setIsLoadingHistory(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(CHAT_HISTORY_PAGE_SIZE));
      if (oldestMessageAt) {
        params.set("before", oldestMessageAt);
      }

      const response = await fetchWithErrorHandlers(
        `/api/chat/${id}/messages?${params.toString()}`
      );
      const data = (await response.json()) as {
        messages?: ChatMessage[];
        hasMore?: boolean;
        oldestMessageAt?: string | null;
      };

      const incomingMessages = Array.isArray(data.messages)
        ? data.messages
        : [];
      if (incomingMessages.length > 0) {
        setMessages((prev) => [...incomingMessages, ...prev]);
      }

      if (typeof data.hasMore === "boolean") {
        setHasMoreHistory(data.hasMore);
      } else {
        setHasMoreHistory(false);
      }

      if (data && "oldestMessageAt" in data) {
        setOldestMessageAt(
          typeof data.oldestMessageAt === "string" ? data.oldestMessageAt : null
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "");
      toast({
        type: "error",
        description:
          message ||
          translate(
            "chat.history.load_failed",
            "Unable to load earlier messages."
          ),
      });
    } finally {
      setIsLoadingHistory(false);
    }
  }, [
    hasMoreHistory,
    id,
    isLoadingHistory,
    oldestMessageAt,
    setMessages,
    translate,
  ]);

  useAutoResume({
    autoResume,
    initialMessages,
    resumeStream,
    setMessages,
  });

  const studyHeader = isStudyMode ? (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2 py-1">
          <BookOpen className="h-3.5 w-3.5" />
          Study mode
        </span>
        {studyQuizActive ? (
          <span className="rounded-full border border-border/60 bg-background px-2 py-1">
            Quiz active
          </span>
        ) : null}
      </div>
      {studyContext ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background px-3 py-2 text-xs">
          <div className="min-w-0 space-y-0.5">
            <div className="truncate font-semibold text-foreground">
              {studyContext.title}
            </div>
            <div className="truncate text-muted-foreground">
              {studyContext.exam} / {studyContext.role} / {studyContext.year}
            </div>
          </div>
          <Button
            className="cursor-pointer"
            onClick={clearStudyContext}
            size="sm"
            type="button"
            variant="ghost"
          >
            Clear
          </Button>
        </div>
      ) : null}
      <StudyPromptChips
        assistChips={studyAssistChips}
        chatId={id}
        sendMessage={sendMessage}
      />
    </div>
  ) : null;

  const studyActions = isStudyMode
    ? {
        activePaperId: studyContext?.id ?? null,
        isQuizActive: studyQuizActive,
        onView: handleStudyView,
        onAsk: handleStudyAsk,
        onQuiz: handleStudyQuiz,
        onJumpToQuestionPaper: handleJumpToQuestionPaper,
      }
    : undefined;

  return (
    <>
      {showActionProgress ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 top-0 z-40 h-1 bg-border/50"
        >
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${actionProgress}%` }}
          />
        </div>
      ) : null}
      <div className="overscroll-behavior-contain flex h-dvh min-w-0 touch-pan-y flex-col bg-background">
        <ChatHeader
          chatId={id}
          isReadonly={isReadonly}
          onModelChange={handleModelChange}
          selectedModelId={currentModelId}
          selectedVisibilityType={initialVisibilityType}
        />

        <Messages
          chatId={id}
          greetingSubtitle={greetingSubtitle}
          hasMoreHistory={hasMoreHistory}
          header={studyHeader}
          isArtifactVisible={isArtifactVisible}
          isGeneratingImage={isGeneratingImage}
          isLoadingHistory={isLoadingHistory}
          isReadonly={isReadonly}
          messages={messages}
          onLoadMoreHistory={loadOlderMessages}
          regenerate={regenerate}
          selectedModelId={currentModelId}
          selectedVisibilityType={visibilityType}
          sendMessage={sendMessage}
          setMessages={setMessages}
          status={status}
          suggestedPrompts={suggestedPrompts}
          iconPromptActions={iconPromptActions}
          onIconPromptSelect={handleIconPromptSelect}
          studyActions={studyActions}
          votes={votes}
        />

        <div className="sticky bottom-0 z-1 mx-auto flex w-full max-w-4xl gap-2 border-t-0 bg-background px-2 pb-3 md:px-4 md:pb-4">
          {isReadonly ? null : (
            <div className="flex w-full flex-col gap-2">
              {iconPromptSuggestions.length > 0 ? (
                <div className="rounded-lg bg-background p-2">
                  {iconPromptSuggestions.map((suggestion, index) => (
                    <button
                      className="w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition hover:bg-muted"
                      key={`${suggestion.label}-${index}`}
                      onClick={() => handleIconPromptSuggestionSelect(suggestion)}
                      type="button"
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <MultimodalInput
                attachments={attachments}
                chatId={id}
                documentUploadsEnabled={documentUploadsEnabled}
                imageGenerationCanGenerate={
                  imageGeneration.canGenerate && !isStudyMode
                }
                imageGenerationEnabled={imageGeneration.enabled && !isStudyMode}
                imageGenerationRequiresPaidCredits={
                  imageGeneration.requiresPaidCredits
                }
                imageGenerationSelected={isImageMode && !isStudyMode}
                isGeneratingImage={isGeneratingImage}
                input={input}
                messages={messages}
                onLanguageChange={handleLanguageChangeFromInput}
                onModelChange={handleModelChange}
                selectedLanguageCode={currentLanguageCode}
                selectedModelId={currentModelId}
                selectedVisibilityType={visibilityType}
                onGenerateImage={() => {
                  void generateImageFromPrompt(input);
                }}
                onClearStudyQuestionReference={() =>
                  setStudyQuestionReference(null)
                }
                onJumpToQuestionPaper={handleJumpToQuestionPaper}
                sendMessage={sendMessage}
                setAttachments={setAttachments}
                setInput={setInput}
                setMessages={setMessages}
                status={status}
                stop={stop}
                studyQuestionReference={studyQuestionReference}
                onToggleImageMode={() => {
                  if (!imageGeneration.enabled || isStudyMode) {
                    return;
                  }
                  if (!imageGeneration.canGenerate) {
                    setShowImageUpgradeDialog(true);
                    return;
                  }
                  setIsImageMode((prev) => !prev);
                }}
              />
              <p className="px-2 text-center text-muted-foreground text-xs">
                {translate(
                  "chat.disclaimer.text",
                  "KhasiGPT or other AI Models can make mistakes. Check important details."
                )}{" "}
                <Link className="underline" href="/privacy-policy">
                  {translate(
                    "chat.disclaimer.privacy_link",
                    "See privacy policy."
                  )}
                </Link>
              </p>
            </div>
          )}
      </div>
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setStudyViewerPaper(null);
          }
        }}
        open={Boolean(studyViewerPaper)}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{studyViewerPaper?.title ?? "Question paper"}</DialogTitle>
            <DialogDescription>
              {studyViewerPaper
                ? `${studyViewerPaper.exam} / ${studyViewerPaper.role} / ${studyViewerPaper.year}`
                : "Review the selected question paper."}
            </DialogDescription>
          </DialogHeader>
          {studyViewerPaper ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2 text-muted-foreground">
                <span className="rounded-full border border-border/60 px-2 py-0.5 text-xs">
                  {studyViewerPaper.language}
                </span>
                {studyViewerPaper.tags.map((tag) => (
                  <span
                    className="rounded-full border border-border/60 px-2 py-0.5 text-xs"
                    key={`${studyViewerPaper.id}-tag-${tag}`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              {studyViewerPaper.sourceUrl ? (
                <div className="overflow-hidden rounded-lg border">
                  <iframe
                    className="h-[60vh] w-full"
                    src={studyViewerPaper.sourceUrl}
                    title={studyViewerPaper.title}
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed px-4 py-6 text-center text-muted-foreground text-xs">
                  No file was uploaded for this paper.
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                {studyViewerPaper.sourceUrl ? (
                  <Button asChild variant="outline">
                    <a
                      className="cursor-pointer"
                      href={studyViewerPaper.sourceUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Download
                    </a>
                  </Button>
                ) : null}
                <Button
                  className="cursor-pointer"
                  onClick={() => setStudyViewerPaper(null)}
                  type="button"
                  variant="ghost"
                >
                  Close
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={setShowRechargeDialog}
        open={showRechargeDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {translate("chat.recharge.alert.title", "Credit top-up required")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {translate(
                "chat.recharge.alert.description",
                "You've used all of your free daily messages. Top up credits to keep chatting without interruptions."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {translate("common.close", "Close")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowRechargeDialog(false);
                router.push("/recharge");
              }}
            >
              {translate("chat.recharge.alert.confirm", "Go to recharge")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={setShowCreditCardAlert}
        open={showCreditCardAlert}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {translate("chat.gateway.alert.title", "Activate AI Gateway")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {translate(
                "chat.gateway.alert.description",
                "This application requires {subject} to activate Vercel AI Gateway."
              ).replace(
                "{subject}",
                process.env.NODE_ENV === "production"
                  ? translate("chat.gateway.alert.subject.owner", "the owner")
                  : translate("chat.gateway.alert.subject.you", "you")
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {translate("common.cancel", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                window.open(
                  "https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card",
                  "_blank"
                );
                window.location.href = "/";
              }}
            >
              {translate("chat.gateway.alert.confirm", "Activate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={setShowImageUpgradeDialog}
        open={showImageUpgradeDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{imageUpgradeTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {imageUpgradeDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {translate("common.close", "Close")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowImageUpgradeDialog(false);
                startActionProgress();
                router.push("/recharge");
              }}
            >
              {translate("image.actions.locked.cta", "Go to recharge")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setPendingUiLanguage(null);
          }
        }}
        open={Boolean(pendingUiLanguage)}
      >
        <AlertDialogContent className="w-[90vw] max-w-sm gap-3 p-4">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold">
              {translate(
                "chat.language.ui_prompt.title",
                "Change interface language?"
              )}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              {translate(
                "chat.language.ui_prompt.description",
                "Do you also want the interface language to change to {language}?"
              ).replace("{language}", pendingUiLanguage?.name ?? "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2 sm:space-x-2">
            <AlertDialogCancel
              className="h-8 px-3 text-xs"
              onClick={() => {
                setPendingUiLanguage(null);
              }}
            >
              {translate(
                "chat.language.ui_prompt.cancel",
                "No, keep interface"
              )}
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-8 px-3 text-xs"
              onClick={() => {
                if (!pendingUiLanguage) {
                  return;
                }
                const targetCode = pendingUiLanguage.code;
                setPendingUiLanguage(null);
                setUiLanguageTarget(targetCode);
                setLanguage(targetCode);
              }}
            >
              {translate(
                "chat.language.ui_prompt.confirm",
                "Yes, change interface"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {uiLanguageTarget ? (
        <div
          aria-live="polite"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm"
          role="status"
        >
          <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-lg border bg-background px-5 py-4 text-center shadow-lg">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm font-medium">
              {translate(
                "chat.language.ui_prompt.loading",
                "Switching interface language..."
              )}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
