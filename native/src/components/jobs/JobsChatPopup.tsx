import { useMemo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Keyboard,
  type KeyboardEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ListRenderItem,
} from "react-native";
import {
  ArrowUp,
  ChevronDown,
  Globe,
  Lock,
  Square,
  X,
} from "lucide-react-native";
import { API_BASE_URL, api } from "@/api/client";
import type {
  ChatMessage,
  ChatMessagePart,
  JobChatCard,
  ModelSummary,
} from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/Button";
import { refreshChatHistory } from "@/lib/chat-history-store";
import { radius, spacing, typography } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";
import { generateUUID } from "@/utils/id";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type VisibilityType = "private" | "public";

type JobContext = {
  company: string;
  id: string;
  location: string;
  title: string;
};

type JobsChatPopupProps = {
  activeChatId?: string | null;
  detailJobContext?: JobContext | null;
  onClose: () => void;
  onOpenJobDetails: (jobId: string) => void;
  visible: boolean;
};

type SelectionSheetType = "model" | "visibility" | null;

type PopupJobReference = {
  id: string;
  preview: string;
  title: string;
};

type PopupTextPart = {
  text: string;
  type: "text";
};

type PopupJobCardsPart = {
  data: {
    jobs: JobChatCard[];
  };
  type: "data-jobCards";
};

type PopupJobTitleReferencePart = {
  data: {
    preview: string;
    title: string;
  };
  type: "data-jobTitleReference";
};

type PopupMessagePart =
  | PopupJobCardsPart
  | PopupJobTitleReferencePart
  | PopupTextPart;

type PopupMessage = {
  createdAt?: string;
  id: string;
  parts: PopupMessagePart[];
  role: "assistant" | "user";
};

type SelectionOption = {
  description?: string;
  label: string;
  value: string;
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function textFromMessage(message: ChatMessage) {
  if (message.content) {
    return message.content;
  }

  return (
    message.parts
      ?.map((part) =>
        part.type === "text" && typeof part.text === "string" ? part.text : ""
      )
      .filter(Boolean)
      .join("\n") ?? ""
  );
}

function buildJobReference(job: JobChatCard): PopupJobReference {
  return {
    id: job.id,
    title: job.title,
    preview: [job.company, job.location].filter(Boolean).join(" / "),
  };
}

function normalizeTextPart(part: ChatMessagePart): PopupTextPart | null {
  if (part.type !== "text" || typeof part.text !== "string") {
    return null;
  }

  return {
    type: "text",
    text: part.text,
  };
}

function normalizeJobCardsPart(part: ChatMessagePart): PopupJobCardsPart | null {
  if (part.type !== "data-jobCards") {
    return null;
  }

  const data = part.data as { jobs?: unknown } | undefined;
  const jobs = Array.isArray(data?.jobs)
    ? data.jobs.filter(
        (job): job is JobChatCard =>
          typeof job?.id === "string" &&
          typeof job?.title === "string" &&
          typeof job?.company === "string" &&
          typeof job?.location === "string" &&
          typeof job?.employmentType === "string"
      )
    : [];

  if (jobs.length === 0) {
    return null;
  }

  return {
    type: "data-jobCards",
    data: {
      jobs,
    },
  };
}

function normalizeJobTitleReferencePart(
  part: ChatMessagePart
): PopupJobTitleReferencePart | null {
  if (part.type !== "data-jobTitleReference") {
    return null;
  }

  const data = part.data as
    | {
        preview?: unknown;
        title?: unknown;
      }
    | undefined;
  if (typeof data?.title !== "string" || typeof data?.preview !== "string") {
    return null;
  }

  return {
    type: "data-jobTitleReference",
    data: {
      title: data.title,
      preview: data.preview,
    },
  };
}

function normalizeChatMessage(message: ChatMessage): PopupMessage | null {
  if (message.role !== "assistant" && message.role !== "user") {
    return null;
  }

  const normalizedParts =
    message.parts
      ?.map((part) => {
        return (
          normalizeTextPart(part) ??
          normalizeJobCardsPart(part) ??
          normalizeJobTitleReferencePart(part)
        );
      })
      .filter((part): part is PopupMessagePart => part !== null) ?? [];

  if (normalizedParts.length === 0) {
    const fallbackText = textFromMessage(message).trim();
    if (!fallbackText) {
      return null;
    }

    normalizedParts.push({
      type: "text",
      text: fallbackText,
    });
  }

  return {
    id: message.id || generateUUID(),
    role: message.role,
    parts: normalizedParts,
    createdAt: message.createdAt,
  };
}

function normalizeChatMessages(messages: ChatMessage[]) {
  return messages
    .map((message) => normalizeChatMessage(message))
    .filter((message): message is PopupMessage => message !== null);
}

function getJobTypeLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "government") {
    return "Government";
  }
  if (normalized === "private") {
    return "Private";
  }
  return value.trim() || "Other";
}

function parseSseEvents(buffer: string) {
  const events = buffer.replace(/\r\n/g, "\n").split("\n\n");
  return {
    completeEvents: events.slice(0, -1),
    remainder: events.at(-1) ?? "",
  };
}

function parseSseDataPayload(eventChunk: string) {
  const data = eventChunk
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s*/, ""))
    .join("\n")
    .trim();

  if (!data || data === "[DONE]") {
    return null;
  }

  try {
    return JSON.parse(data) as
      | { type: "error"; errorText?: string }
      | { type: "text-delta"; delta: string; id: string }
      | { type: string; [key: string]: unknown };
  } catch {
    return null;
  }
}

function InlineJobCard({
  isSelected,
  job,
  onAsk,
  onView,
}: {
  isSelected: boolean;
  job: JobChatCard;
  onAsk: () => void;
  onView: () => void;
}) {
  const { palette } = useAppTheme();

  return (
    <View
      style={[
        styles.inlineJobCard,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
        },
      ]}
    >
      <View style={styles.inlineJobCopy}>
        <Text style={[styles.inlineJobTitle, { color: palette.foreground }]}>
          {job.title}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.inlineJobMeta, { color: palette.mutedForeground }]}
        >
          {[job.company, job.location].filter(Boolean).join(" / ")}
        </Text>
        <Text
          numberOfLines={2}
          style={[styles.inlineJobMeta, { color: palette.mutedForeground }]}
        >
          {job.salary
            ? `Salary: ${job.salary} • ${getJobTypeLabel(job.employmentType)}`
            : getJobTypeLabel(job.employmentType)}
        </Text>
      </View>
      <View style={styles.inlineJobActions}>
        <Button onPress={onView} style={styles.inlineActionButton} variant="outline">
          View
        </Button>
        <Button
          onPress={onAsk}
          style={styles.inlineActionButton}
          variant={isSelected ? "default" : "outline"}
        >
          {isSelected ? "Selected" : "Ask"}
        </Button>
      </View>
    </View>
  );
}

function SelectionSheet({
  onClose,
  onSelect,
  options,
  title,
  value,
  visible,
}: {
  onClose: () => void;
  onSelect: (value: string) => void;
  options: SelectionOption[];
  title: string;
  value: string;
  visible: boolean;
}) {
  const { palette } = useAppTheme();
  const insets = useSafeAreaInsets();

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.sheetLayer}>
      <Pressable onPress={onClose} style={styles.sheetBackdrop} />
      <View
        style={[
          styles.sheetCard,
          {
            backgroundColor: palette.background,
            borderColor: palette.border,
            paddingBottom: Math.max(spacing[4], insets.bottom + spacing[2]),
          },
        ]}
      >
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: palette.foreground }]}>
            {title}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.sheetCloseButton,
              { opacity: pressed ? 0.72 : 1 },
            ]}
          >
            <X color={palette.foreground} size={18} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.sheetOptions}>
          {options.map((option) => {
            const isActive = option.value === value;
            return (
              <Pressable
                accessibilityRole="button"
                key={option.value}
                onPress={() => onSelect(option.value)}
                style={({ pressed }) => [
                  styles.sheetOption,
                  {
                    backgroundColor: isActive ? palette.muted : palette.background,
                    borderColor: palette.border,
                    opacity: pressed ? 0.82 : 1,
                  },
                ]}
              >
                <View style={styles.sheetOptionCopy}>
                  <Text
                    style={[styles.sheetOptionTitle, { color: palette.foreground }]}
                  >
                    {option.label}
                  </Text>
                  {option.description ? (
                    <Text
                      style={[
                        styles.sheetOptionDescription,
                        { color: palette.mutedForeground },
                      ]}
                    >
                      {option.description}
                    </Text>
                  ) : null}
                </View>
                {isActive ? (
                  <Text style={[styles.sheetOptionCheck, { color: palette.foreground }]}>
                    ✓
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

function MarkdownMessage({
  color,
  text,
  variant = "assistant",
}: {
  color: string;
  text: string;
  variant?: "assistant" | "user";
}) {
  const blocks = useMemo(() => parseMarkdownBlocks(text), [text]);
  const { palette } = useAppTheme();

  if (!text.trim()) {
    return (
      <Text
        style={[
          variant === "user" ? styles.userMarkdownParagraph : styles.markdownParagraph,
          { color },
        ]}
      >
        Thinking...
      </Text>
    );
  }

  return (
    <View style={styles.markdownRoot}>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}-${block.content.slice(0, 12)}`;
        if (block.type === "code") {
          return (
            <View
              key={key}
              style={[
                styles.codeBlock,
                {
                  backgroundColor: palette.muted,
                  borderColor: palette.border,
                },
              ]}
            >
              {block.language ? (
                <Text
                  style={[
                    styles.codeLanguage,
                    { color: palette.mutedForeground },
                  ]}
                >
                  {block.language}
                </Text>
              ) : null}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text style={[styles.codeText, { color: palette.foreground }]}>
                  {block.content}
                </Text>
              </ScrollView>
            </View>
          );
        }

        if (block.type === "heading") {
          return (
            <Text
              key={key}
              style={[
                variant === "user" ? styles.userMarkdownHeading : styles.markdownHeading,
                { color },
              ]}
            >
              {block.content}
            </Text>
          );
        }

        if (block.type === "list") {
          return (
            <View key={key} style={styles.markdownList}>
              {block.items.map((item, itemIndex) => (
                <View
                  key={`${key}-${itemIndex}-${item.slice(0, 8)}`}
                  style={styles.markdownListRow}
                >
                  <Text style={[styles.markdownBullet, { color }]}>•</Text>
                  <Text
                    style={[
                      variant === "user"
                        ? styles.userMarkdownParagraph
                        : styles.markdownParagraph,
                      { color },
                    ]}
                  >
                    {renderInlineMarkdown(item, color)}
                  </Text>
                </View>
              ))}
            </View>
          );
        }

        return (
          <Text
            key={key}
            style={[
              variant === "user" ? styles.userMarkdownParagraph : styles.markdownParagraph,
              { color },
            ]}
          >
            {renderInlineMarkdown(block.content, color)}
          </Text>
        );
      })}
    </View>
  );
}

type MarkdownBlock =
  | { type: "paragraph"; content: string }
  | { type: "heading"; content: string }
  | { type: "code"; content: string; language: string | null }
  | { type: "list"; items: string[]; content: string };

function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] | null = null;
  let codeLanguage: string | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({
        type: "paragraph",
        content: paragraph.join(" ").trim(),
      });
      paragraph = [];
    }
  };

  const flushList = () => {
    if (list.length > 0) {
      blocks.push({
        type: "list",
        items: list,
        content: list.join("|"),
      });
      list = [];
    }
  };

  for (const line of lines) {
    const fence = line.match(/^```(\w+)?/);
    if (fence) {
      if (code) {
        blocks.push({
          type: "code",
          content: code.join("\n"),
          language: codeLanguage,
        });
        code = null;
        codeLanguage = null;
      } else {
        flushParagraph();
        flushList();
        code = [];
        codeLanguage = fence[1] ?? null;
      }
      continue;
    }

    if (code) {
      code.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", content: heading[1].trim() });
      continue;
    }

    const listItem = line.match(/^\s*[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      list.push(listItem[1].trim());
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  if (code) {
    blocks.push({
      type: "code",
      content: code.join("\n"),
      language: codeLanguage,
    });
  }

  flushParagraph();
  flushList();

  return blocks;
}

function renderInlineMarkdown(text: string, color: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <Text key={`${part}-${index}`} style={styles.inlineCode}>
          {part.slice(1, -1)}
        </Text>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <Text key={`${part}-${index}`} style={[styles.inlineStrong, { color }]}>
          {part.slice(2, -2)}
        </Text>
      );
    }

    return part;
  });
}

export function JobsChatPopup({
  activeChatId = null,
  detailJobContext = null,
  onClose,
  onOpenJobDetails,
  visible,
}: JobsChatPopupProps) {
  const { bootstrap } = useAuth();
  const { palette } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();
  const listRef = useRef<FlatList<PopupMessage> | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  const composerAnchorRef = useRef<View | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [chatId, setChatId] = useState(() => generateUUID());
  const [messages, setMessages] = useState<PopupMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isRestoredChatLoading, setIsRestoredChatLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [selectedJobReference, setSelectedJobReference] =
    useState<PopupJobReference | null>(null);
  const [selectionSheet, setSelectionSheet] = useState<SelectionSheetType>(null);
  const [selectedModelId, setSelectedModelId] = useState(
    bootstrap?.modelConfig.defaultModelId ??
      bootstrap?.modelConfig.models[0]?.id ??
      ""
  );
  const [selectedLanguageCode, setSelectedLanguageCode] = useState(
    bootstrap?.chat.languages.find((language) => language.isDefault)?.code ??
      bootstrap?.i18n.activeLanguage.code ??
      "en"
  );
  const [selectedVisibilityType, setSelectedVisibilityType] =
    useState<VisibilityType>("private");
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardScreenY, setKeyboardScreenY] = useState<number | null>(null);
  const [composerBottomOffset, setComposerBottomOffset] = useState(0);
  const [isComposerLanguageVisible, setIsComposerLanguageVisible] =
    useState(false);
  const composerLanguageScale = useRef(new Animated.Value(0.96)).current;
  const composerLanguageOpacity = useRef(new Animated.Value(0)).current;

  const models = bootstrap?.modelConfig.models ?? [];
  const languages = useMemo(
    () =>
      bootstrap?.chat.languages?.length
        ? bootstrap.chat.languages
        : bootstrap?.i18n.languages ?? [],
    [bootstrap?.chat.languages, bootstrap?.i18n.languages]
  );

  const selectedModel = useMemo(
    () =>
      models.find((model) => model.id === selectedModelId) ??
      models[0] ?? {
        id: "default",
        name: "KhasiGPT",
        description: "",
        supportsReasoning: false,
      },
    [models, selectedModelId]
  );

  const selectedLanguage = useMemo(
    () =>
      languages.find((language) => language.code === selectedLanguageCode) ??
      languages[0] ?? {
        code: "en",
        isActive: true,
        isDefault: true,
        name: "English",
      },
    [languages, selectedLanguageCode]
  );

  const visibilityOptions = useMemo<SelectionOption[]>(
    () => [
      {
        value: "private",
        label: "Private",
        description: "Only you can access this jobs chat.",
      },
      {
        value: "public",
        label: "Public",
        description: "Allow this jobs chat to be shared later.",
      },
    ],
    []
  );

  const modelOptions = useMemo<SelectionOption[]>(
    () =>
      models.map((model: ModelSummary) => ({
        value: model.id,
        label: model.name,
        description: model.description,
      })),
    [models]
  );

  const scrollToLatestMessage = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);
  const topSafePadding = Math.max(
    insets.top,
    Platform.OS === "web" ? 12 : 16
  );
  const popupVerticalGap = clampNumber(Math.round(viewportHeight * 0.008), 6, 12);
  const popupTopPadding = topSafePadding + popupVerticalGap;
  const bottomSystemPadding =
    Platform.OS === "web"
      ? Math.max(insets.bottom, 18)
      : Math.max(insets.bottom, 0);
  const bottomVisualGap = clampNumber(Math.round(viewportHeight * 0.006), 4, 10);
  const bottomSafePadding = bottomSystemPadding + bottomVisualGap;
  const visibleBottomPadding = bottomSafePadding;
  const keyboardComposerGap = 6;

  const recalculateComposerOffset = useCallback(() => {
    const keyboardTop =
      keyboardScreenY !== null
        ? keyboardScreenY
        : keyboardHeight > 0
          ? viewportHeight - keyboardHeight
          : null;

    if (keyboardTop === null) {
      setComposerBottomOffset(0);
      return;
    }

    const anchor = composerAnchorRef.current;
    if (!anchor || typeof anchor.measureInWindow !== "function") {
      return;
    }

    requestAnimationFrame(() => {
      anchor.measureInWindow((_x, y, _width, height) => {
        const anchorBottom = y + height;
        const overlap = anchorBottom - keyboardTop + keyboardComposerGap;
        setComposerBottomOffset(Math.max(0, overlap));
      });
    });
  }, [keyboardHeight, keyboardScreenY, viewportHeight]);

  const closeComposerLanguageMenu = useCallback(() => {
    if (!isComposerLanguageVisible) {
      return;
    }

    Animated.parallel([
      Animated.timing(composerLanguageScale, {
        toValue: 0.96,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(composerLanguageOpacity, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsComposerLanguageVisible(false);
    });
  }, [
    composerLanguageOpacity,
    composerLanguageScale,
    isComposerLanguageVisible,
  ]);

  const openComposerLanguageMenu = useCallback(() => {
    setIsComposerLanguageVisible(true);
    composerLanguageScale.setValue(0.96);
    composerLanguageOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(composerLanguageScale, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(composerLanguageOpacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start();
  }, [composerLanguageOpacity, composerLanguageScale]);

  useEffect(() => {
    if (!models.length) {
      return;
    }

    if (!models.some((model) => model.id === selectedModelId)) {
      setSelectedModelId(
        bootstrap?.modelConfig.defaultModelId ?? models[0]?.id ?? ""
      );
    }
  }, [bootstrap?.modelConfig.defaultModelId, models, selectedModelId]);

  useEffect(() => {
    if (!languages.length) {
      return;
    }

    if (!languages.some((language) => language.code === selectedLanguageCode)) {
      setSelectedLanguageCode(
        bootstrap?.i18n.activeLanguage.code ?? languages[0]?.code ?? "en"
      );
    }
  }, [bootstrap?.i18n.activeLanguage.code, languages, selectedLanguageCode]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    scrollToLatestMessage(false);
  }, [scrollToLatestMessage, visible]);

  useEffect(() => {
    if (activeChatId) {
      return;
    }

    setMessages([]);
    setIsRestoredChatLoading(false);
    setInput("");
    setErrorText(null);
    setSelectedJobReference(null);
    setSelectionSheet(null);
    setIsComposerLanguageVisible(false);
    setChatId(generateUUID());
  }, [activeChatId, detailJobContext?.id]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      setKeyboardScreenY(null);
      setComposerBottomOffset(0);
      setIsComposerLanguageVisible(false);
      return;
    }

    if (Platform.OS === "web") {
      return;
    }

    const handleKeyboardShow = (event: KeyboardEvent) => {
      setIsComposerLanguageVisible(false);
      composerLanguageScale.setValue(0.96);
      composerLanguageOpacity.setValue(0);
      setKeyboardHeight(event.endCoordinates.height);
      setKeyboardScreenY(
        typeof event.endCoordinates.screenY === "number"
          ? event.endCoordinates.screenY
          : null
      );
    };
    const handleKeyboardHide = () => {
      setKeyboardHeight(0);
      setKeyboardScreenY(null);
      setComposerBottomOffset(0);
    };
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, handleKeyboardShow);
    const hideSubscription = Keyboard.addListener(hideEvent, handleKeyboardHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [composerLanguageOpacity, composerLanguageScale, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    recalculateComposerOffset();
  }, [
    input,
    keyboardHeight,
    keyboardScreenY,
    recalculateComposerOffset,
    viewportHeight,
    visible,
  ]);

  const handleSelectJobReference = useCallback((job: JobChatCard) => {
    setSelectedJobReference(buildJobReference(job));
  }, []);

  const handleComposerLanguageSelect = useCallback(
    (code: string) => {
      setSelectedLanguageCode(code);
      closeComposerLanguageMenu();
    },
    [closeComposerLanguageMenu]
  );

  const loadCanonicalMessages = useCallback(
    async (targetChatId: string, minimumMessageCount: number) => {
      let lastMessages: PopupMessage[] = [];
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const result = await api.chatMessages(targetChatId, {
          limit: Math.max(12, minimumMessageCount),
        });
        const canonicalMessages = normalizeChatMessages(result.messages);
        lastMessages = canonicalMessages;
        if (canonicalMessages.length >= minimumMessageCount) {
          setMessages(canonicalMessages);
          scrollToLatestMessage(false);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 360));
      }
      if (lastMessages.length > 0) {
        setMessages(lastMessages);
        scrollToLatestMessage(false);
      }
    },
    [scrollToLatestMessage]
  );

  useEffect(() => {
    if (!visible || !activeChatId) {
      return;
    }

    let isStale = false;
    setChatId(activeChatId);
    setMessages([]);
    setIsRestoredChatLoading(true);
    setErrorText(null);
    setSelectionSheet(null);
    setSelectedJobReference(null);
    setIsComposerLanguageVisible(false);

    const loadRestoredChat = async () => {
      let before: string | null = null;
      let restoredMessages: ChatMessage[] = [];

      for (let page = 0; page < 10; page += 1) {
        const result = await api.chatMessages(activeChatId, {
          before,
          limit: 200,
        });
        restoredMessages = [...result.messages, ...restoredMessages];
        if (!result.hasMore || !result.oldestMessageAt) {
          break;
        }
        before = result.oldestMessageAt;
      }

      return restoredMessages;
    };

    loadRestoredChat()
      .then((restoredMessages) => {
        if (isStale) {
          return;
        }
        setMessages(normalizeChatMessages(restoredMessages));
        setIsRestoredChatLoading(false);
        scrollToLatestMessage(false);
      })
      .catch((error) => {
        if (isStale) {
          return;
        }
        setMessages([]);
        setIsRestoredChatLoading(false);
        setErrorText(
          error instanceof Error ? error.message : "Unable to load jobs chat."
        );
      });

    return () => {
      isStale = true;
      setIsRestoredChatLoading(false);
    };
  }, [activeChatId, scrollToLatestMessage, visible]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) {
      return;
    }

    const userMessageId = generateUUID();
    const assistantMessageId = generateUUID();
    const messageParts: PopupMessagePart[] = [
      ...(selectedJobReference
        ? [
            {
              type: "data-jobTitleReference" as const,
              data: {
                title: selectedJobReference.title,
                preview: selectedJobReference.preview,
              },
            },
          ]
        : []),
      {
        type: "text" as const,
        text: trimmed,
      },
    ];

    const optimisticUserMessage: PopupMessage = {
      id: userMessageId,
      role: "user",
      parts: messageParts,
    };
    const optimisticAssistantMessage: PopupMessage = {
      id: assistantMessageId,
      role: "assistant",
      parts: [{ type: "text", text: "" }],
    };

    setInput("");
    setErrorText(null);
    setIsSending(true);
    setMessages((current) => [...current, optimisticUserMessage, optimisticAssistantMessage]);
    if (!detailJobContext) {
      setSelectedJobReference(null);
    }
    scrollToLatestMessage(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const requestBody = JSON.stringify({
        id: chatId,
        message: {
          id: userMessageId,
          role: "user",
          parts: messageParts,
        },
        chatMode: "jobs",
        selectedChatModel: selectedModelId,
        selectedLanguage: selectedLanguageCode,
        selectedVisibilityType: selectedVisibilityType,
        ...(detailJobContext
          ? {
              jobPostingId: detailJobContext.id,
              originJobPostingId: detailJobContext.id,
            }
          : null),
      });

      let eventBuffer = "";
      let streamedAssistantText = "";

      const updateAssistantText = () => {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  parts: [{ type: "text", text: streamedAssistantText }],
                }
              : message
          )
        );
        scrollToLatestMessage(false);
      };

      const processEventChunk = (eventChunk: string) => {
        const payload = parseSseDataPayload(eventChunk);
        if (!payload) {
          return;
        }

        if (payload.type === "text-delta") {
          streamedAssistantText += payload.delta;
          updateAssistantText();
          return;
        }

        if (payload.type === "error") {
          throw new Error(
            typeof payload.errorText === "string" && payload.errorText.trim()
              ? payload.errorText
              : "Unable to complete the response."
          );
        }
      };

      const processStreamText = (chunk: string) => {
        eventBuffer += chunk;
        const { completeEvents, remainder } = parseSseEvents(eventBuffer);
        eventBuffer = remainder;
        for (const eventChunk of completeEvents) {
          processEventChunk(eventChunk);
        }
      };

      const flushStreamRemainder = () => {
        if (!eventBuffer.trim()) {
          return;
        }
        processEventChunk(eventBuffer);
        eventBuffer = "";
      };

      if (Platform.OS === "web") {
        const response = await fetch(`${API_BASE_URL}/api/chat`, {
          method: "POST",
          credentials: "include",
          signal: controller.signal,
          headers: {
            Accept: "text/event-stream",
            "Content-Type": "application/json",
          },
          body: requestBody,
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || "Unable to send message.");
        }

        const reader = response.body?.getReader();
        if (reader) {
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            processStreamText(decoder.decode(value, { stream: true }));
          }
          flushStreamRemainder();
        }
      } else {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          let seenLength = 0;
          let settled = false;

          const readNextChunk = () => {
            const responseText = xhr.responseText ?? "";
            if (responseText.length <= seenLength) {
              return;
            }
            const nextChunk = responseText.slice(seenLength);
            seenLength = responseText.length;
            processStreamText(nextChunk);
          };

          const cleanup = () => {
            controller.signal.removeEventListener("abort", abortRequest);
          };

          const finish = (callback: () => void) => {
            if (settled) {
              return;
            }
            settled = true;
            cleanup();
            callback();
          };

          const abortRequest = () => {
            xhr.abort();
            finish(() => reject(new DOMException("Aborted", "AbortError")));
          };

          xhr.open("POST", `${API_BASE_URL}/api/chat`);
          xhr.withCredentials = true;
          xhr.setRequestHeader("Accept", "text/event-stream");
          xhr.setRequestHeader("Content-Type", "application/json");
          xhr.onprogress = () => {
            try {
              readNextChunk();
            } catch (error) {
              xhr.abort();
              finish(() => reject(error));
            }
          };
          xhr.onreadystatechange = () => {
            if (xhr.readyState !== XMLHttpRequest.LOADING) {
              return;
            }
            try {
              readNextChunk();
            } catch (error) {
              xhr.abort();
              finish(() => reject(error));
            }
          };
          xhr.onerror = () => {
            finish(() => reject(new Error("Unable to stream the response.")));
          };
          xhr.onabort = () => {
            finish(() => reject(new DOMException("Aborted", "AbortError")));
          };
          xhr.onload = () => {
            try {
              readNextChunk();
            } catch (error) {
              finish(() => reject(error));
              return;
            }
            if (xhr.status < 200 || xhr.status >= 300) {
              finish(() =>
                reject(
                  new Error(
                    (xhr.responseText ?? "").trim() || "Unable to send message."
                  )
                )
              );
              return;
            }
            try {
              flushStreamRemainder();
              finish(resolve);
            } catch (error) {
              finish(() => reject(error));
            }
          };
          controller.signal.addEventListener("abort", abortRequest);
          xhr.send(requestBody);
        });
      }

      await loadCanonicalMessages(chatId, messages.length + 2);
      refreshChatHistory().catch(() => undefined);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      const message =
        error instanceof Error ? error.message : "Unable to complete the response.";
      setErrorText(message);
      setMessages((current) =>
        current.map((messageEntry) =>
          messageEntry.id === assistantMessageId
            ? {
                ...messageEntry,
                parts: [{ type: "text", text: message }],
              }
            : messageEntry
        )
      );
    } finally {
      abortRef.current = null;
      setIsSending(false);
      scrollToLatestMessage(false);
    }
  }, [
    chatId,
    detailJobContext,
    input,
    isSending,
    loadCanonicalMessages,
    messages.length,
    scrollToLatestMessage,
    selectedJobReference,
    selectedLanguageCode,
    selectedModelId,
    selectedVisibilityType,
  ]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsSending(false);
  }, []);

  const renderItem = useCallback<ListRenderItem<PopupMessage>>(
    ({ item }) => {
    const isUser = item.role === "user";
      return (
        <View
          style={[
            styles.messageRow,
            isUser ? styles.messageRowUser : styles.messageRowAssistant,
          ]}
        >
          <View
            style={[
              styles.messageBubble,
              isUser ? styles.userBubble : styles.assistantBubble,
              {
                backgroundColor: isUser ? palette.muted : "transparent",
                borderColor: isUser ? palette.border : "transparent",
              },
            ]}
          >
            {item.parts.map((part, index) => {
              const key = `${item.id}-${part.type}-${index}`;

              if (part.type === "data-jobTitleReference") {
                return (
                  <View
                    key={key}
                    style={[
                      styles.referenceCard,
                      {
                        backgroundColor: palette.background,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.referenceEyebrow,
                        { color: palette.mutedForeground },
                      ]}
                    >
                      Replying about
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.referenceTitle, { color: palette.foreground }]}
                    >
                      {part.data.title}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.referencePreview, { color: palette.mutedForeground }]}
                    >
                      {part.data.preview}
                    </Text>
                  </View>
                );
              }

              if (part.type === "data-jobCards") {
                return (
                  <View key={key} style={styles.inlineJobCardsList}>
                    {part.data.jobs.map((job) => (
                      <InlineJobCard
                        isSelected={selectedJobReference?.id === job.id}
                        job={job}
                        key={job.id}
                        onAsk={() => handleSelectJobReference(job)}
                        onView={() => onOpenJobDetails(job.id)}
                      />
                    ))}
                  </View>
                );
              }

              return (
                <MarkdownMessage
                  color={palette.foreground}
                  key={key}
                  text={part.text}
                  variant={isUser ? "user" : "assistant"}
                />
              );
            })}

            {!isUser && isSending && messages.at(-1)?.id === item.id ? (
              <View style={styles.streamingRow}>
                <ActivityIndicator color={palette.mutedForeground} size="small" />
              </View>
            ) : null}
          </View>
        </View>
      );
    },
    [
      handleSelectJobReference,
      isSending,
      messages,
      onOpenJobDetails,
      palette.background,
      palette.border,
      palette.foreground,
      palette.muted,
      palette.mutedForeground,
      selectedJobReference?.id,
    ]
  );

  const emptyStateText = activeChatId
    ? isRestoredChatLoading
      ? "Loading chat..."
      : "No messages found in this chat."
    : "Send a message to get started.";

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.modalRoot}>
        <Pressable onPress={onClose} style={styles.modalBackdrop} />
        <View
          style={[
            styles.modalContent,
          ]}
        >
          <View
            style={[
              styles.popupCard,
              {
                backgroundColor: palette.background,
                borderColor: palette.border,
                top: popupTopPadding,
                bottom: visibleBottomPadding,
              },
            ]}
          >
            <View
              style={[
                styles.popupHeader,
                { borderBottomColor: palette.border },
              ]}
            >
              <View style={styles.popupHeaderControls}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    closeComposerLanguageMenu();
                    setSelectionSheet("visibility");
                  }}
                  style={({ pressed }) => [
                    styles.headerControl,
                    {
                      backgroundColor: palette.background,
                      borderColor: palette.border,
                      opacity: pressed ? 0.78 : 1,
                    },
                  ]}
                >
                  <Lock color={palette.foreground} size={16} />
                  <ChevronDown color={palette.foreground} size={14} />
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    closeComposerLanguageMenu();
                    setSelectionSheet("model");
                  }}
                  style={({ pressed }) => [
                    styles.modelControl,
                    { opacity: pressed ? 0.78 : 1 },
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[styles.modelControlText, { color: palette.foreground }]}
                  >
                    {selectedModel.name}
                  </Text>
                  <ChevronDown color={palette.foreground} size={14} />
                </Pressable>
              </View>

              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                style={({ pressed }) => [
                  styles.closeButton,
                  {
                    backgroundColor: palette.background,
                    borderColor: palette.border,
                    opacity: pressed ? 0.78 : 1,
                  },
                ]}
              >
                <X color={palette.foreground} size={20} />
              </Pressable>
            </View>

            <FlatList
              contentContainerStyle={styles.messagesContent}
              data={messages}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View
                  style={[
                    styles.emptyState,
                    {
                      backgroundColor: palette.background,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  {isRestoredChatLoading ? (
                    <ActivityIndicator
                      color={palette.mutedForeground}
                      size="small"
                    />
                  ) : null}
                  <Text style={[styles.emptyStateText, { color: palette.mutedForeground }]}>
                    {emptyStateText}
                  </Text>
                </View>
              }
              onContentSizeChange={() => scrollToLatestMessage(false)}
              ref={listRef}
              renderItem={renderItem}
              showsVerticalScrollIndicator={false}
              style={styles.messagesList}
            />

            {errorText ? (
              <Text style={[styles.errorText, { color: palette.destructive }]}>
                {errorText}
              </Text>
            ) : null}

            {isComposerLanguageVisible ? (
              <Pressable
                onPress={closeComposerLanguageMenu}
                style={styles.composerLanguageDismissArea}
              />
            ) : null}

            <View
              onLayout={() => {
                recalculateComposerOffset();
              }}
              ref={composerAnchorRef}
              style={styles.composerAnchor}
            >
              <View
              style={[
                styles.composerShell,
                {
                  transform: [{ translateY: -composerBottomOffset }],
                },
              ]}
              >
              {selectedJobReference ? (
                <View
                  style={[
                    styles.referenceChip,
                    {
                      backgroundColor: palette.muted,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <View style={styles.referenceChipCopy}>
                    <Text
                      style={[
                        styles.referenceEyebrow,
                        { color: palette.mutedForeground },
                      ]}
                    >
                      Replying about
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.referenceTitle, { color: palette.foreground }]}
                    >
                      {selectedJobReference.title}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[styles.referencePreview, { color: palette.mutedForeground }]}
                    >
                      {selectedJobReference.preview}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setSelectedJobReference(null)}
                    style={({ pressed }) => [
                      styles.referenceChipClose,
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <X color={palette.foreground} size={16} />
                  </Pressable>
                </View>
              ) : null}

              <View
                style={[
                  styles.composerCard,
                  {
                    backgroundColor: palette.background,
                    borderColor: palette.border,
                  },
                ]}
              >
                <TextInput
                  multiline
                  onChangeText={setInput}
                  onFocus={closeComposerLanguageMenu}
                  placeholder="Send a message..."
                  placeholderTextColor={palette.mutedForeground}
                  ref={inputRef}
                  style={[styles.composerInput, { color: palette.foreground }]}
                  value={input}
                />

                <View style={styles.composerFooter}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      if (isComposerLanguageVisible) {
                        closeComposerLanguageMenu();
                        return;
                      }
                      setSelectionSheet(null);
                      openComposerLanguageMenu();
                    }}
                    style={({ pressed }) => [
                      styles.languageControl,
                      { opacity: pressed ? 0.78 : 1 },
                    ]}
                  >
                    <Globe color={palette.foreground} size={16} />
                    <Text
                      style={[
                        styles.languageControlText,
                        { color: palette.foreground },
                      ]}
                    >
                      {selectedLanguage.name}
                    </Text>
                    <ChevronDown color={palette.foreground} size={14} />
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    disabled={(!input.trim() && !isSending) || (!isSending && !selectedModelId)}
                    onPress={() => {
                      closeComposerLanguageMenu();
                      if (isSending) {
                        stopStreaming();
                        return;
                      }
                      void sendMessage();
                    }}
                    style={({ pressed }) => [
                      styles.sendButton,
                      {
                        backgroundColor:
                          !input.trim() && !isSending ? palette.muted : palette.primary,
                        opacity:
                          (!input.trim() && !isSending) || pressed ? 0.82 : 1,
                      },
                    ]}
                  >
                    {isSending ? (
                      <Square color={palette.primaryForeground} size={16} />
                    ) : (
                      <ArrowUp
                        color={
                          !input.trim() ? palette.mutedForeground : palette.primaryForeground
                        }
                        size={18}
                      />
                    )}
                  </Pressable>
                </View>
              </View>
              {isComposerLanguageVisible ? (
                <Animated.View
                  style={[
                    styles.composerLanguageMenu,
                    {
                      backgroundColor: palette.popover,
                      borderColor: palette.border,
                      opacity: composerLanguageOpacity,
                      transform: [{ scale: composerLanguageScale }],
                    },
                  ]}
                >
                  {languages.map((language) => (
                    <Pressable
                      key={language.code}
                      onPress={() => handleComposerLanguageSelect(language.code)}
                      style={styles.composerLanguageItem}
                    >
                      <Text
                        style={[
                          styles.composerLanguageCheck,
                          { color: palette.foreground },
                        ]}
                      >
                        {language.code === selectedLanguageCode ? "✓" : ""}
                      </Text>
                      <Text
                        style={[
                          styles.composerLanguageText,
                          { color: palette.foreground },
                        ]}
                      >
                        {language.name}
                      </Text>
                      {language.code === selectedLanguageCode ? (
                        <Text
                          style={[
                            styles.composerLanguageActive,
                            { color: palette.mutedForeground },
                          ]}
                        >
                          Active
                        </Text>
                      ) : null}
                    </Pressable>
                  ))}
                </Animated.View>
              ) : null}
              </View>
            </View>

            <SelectionSheet
              onClose={() => setSelectionSheet(null)}
              onSelect={(value) => {
                setSelectedVisibilityType(value as VisibilityType);
                setSelectionSheet(null);
              }}
              options={visibilityOptions}
              title="Chat visibility"
              value={selectedVisibilityType}
              visible={selectionSheet === "visibility"}
            />
            <SelectionSheet
              onClose={() => setSelectionSheet(null)}
              onSelect={(value) => {
                setSelectedModelId(value);
                setSelectionSheet(null);
              }}
              options={modelOptions}
              title="Model"
              value={selectedModelId}
              visible={selectionSheet === "model"}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  assistantBubble: {
    alignSelf: "stretch",
    paddingHorizontal: 0,
    paddingVertical: 0,
    width: "100%",
  },
  closeButton: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  codeBlock: {
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing[2],
    padding: spacing[3],
  },
  codeLanguage: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  codeText: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    fontSize: 13,
    lineHeight: 19,
  },
  composerCard: {
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 126,
    paddingBottom: spacing[3],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
  },
  composerFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing[3],
  },
  composerAnchor: {
    overflow: "visible",
  },
  composerLanguageDismissArea: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 44,
    bottom: 0,
    zIndex: 2,
  },
  composerLanguageMenu: {
    position: "absolute",
    left: 70,
    bottom: 42,
    width: 220,
    borderWidth: 1,
    borderRadius: 4,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 3,
  },
  composerLanguageItem: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 8,
  },
  composerLanguageCheck: {
    width: 14,
    fontSize: 15,
    fontWeight: "700",
  },
  composerLanguageText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  composerLanguageActive: {
    fontSize: 12,
  },
  composerInput: {
    fontSize: 16,
    maxHeight: 112,
    minHeight: 56,
    paddingBottom: spacing[3],
    textAlignVertical: "top",
  },
  composerShell: {
    gap: spacing[2],
    paddingBottom: spacing[3],
    paddingHorizontal: spacing[3],
    paddingTop: spacing[3],
  },
  emptyState: {
    alignItems: "center",
    borderRadius: 22,
    borderStyle: "dashed",
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 88,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[5],
  },
  emptyStateText: {
    fontSize: typography.small,
    lineHeight: 22,
    textAlign: "center",
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: spacing[4],
  },
  headerControl: {
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  inlineActionButton: {
    borderRadius: 10,
    minHeight: 34,
    minWidth: 78,
  },
  inlineCode: {
    backgroundColor: "rgba(148, 163, 184, 0.18)",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    fontSize: 14,
  },
  inlineJobActions: {
    flexDirection: "row",
    gap: spacing[2],
  },
  inlineJobCard: {
    borderRadius: 18,
    borderWidth: 1,
    gap: spacing[3],
    padding: spacing[3],
  },
  inlineJobCardsList: {
    gap: spacing[2],
    marginTop: spacing[2],
  },
  inlineJobCopy: {
    gap: 4,
  },
  inlineJobMeta: {
    fontSize: 13,
    lineHeight: 18,
  },
  inlineJobTitle: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 22,
  },
  inlineStrong: {
    fontWeight: "700",
  },
  languageControl: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  languageControlText: {
    fontSize: 15,
    fontWeight: "500",
  },
  markdownBullet: {
    fontSize: 15,
    lineHeight: 22,
  },
  markdownHeading: {
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 24,
  },
  markdownList: {
    gap: 5,
  },
  markdownListRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 7,
  },
  markdownParagraph: {
    fontSize: 15,
    lineHeight: 22,
  },
  markdownRoot: {
    gap: 8,
  },
  messageBubble: {
    maxWidth: "100%",
  },
  messageRow: {
    marginBottom: spacing[3],
  },
  messageRowAssistant: {
    alignItems: "flex-start",
  },
  messageRowUser: {
    alignItems: "flex-end",
  },
  messagesContent: {
    flexGrow: 1,
    paddingHorizontal: spacing[3],
    paddingTop: spacing[3],
    paddingBottom: spacing[4],
  },
  messagesList: {
    flex: 1,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.14)",
  },
  modalContent: {
    flex: 1,
    position: "relative",
  },
  modalRoot: {
    flex: 1,
  },
  modelControl: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: 6,
    minWidth: 0,
  },
  modelControlText: {
    fontSize: 16,
    fontWeight: "600",
    maxWidth: 172,
  },
  popupCard: {
    left: 8,
    position: "absolute",
    borderRadius: 28,
    borderWidth: 1,
    minHeight: 0,
    overflow: "hidden",
    right: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 18,
  },
  popupHeader: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  popupHeaderControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing[3],
    minWidth: 0,
  },
  referenceCard: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
    marginBottom: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  referenceChip: {
    alignItems: "flex-start",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  referenceChipClose: {
    alignItems: "center",
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  referenceChipCopy: {
    flex: 1,
    gap: 2,
  },
  referenceEyebrow: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  referencePreview: {
    fontSize: 12,
    lineHeight: 16,
  },
  referenceTitle: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  sendButton: {
    alignItems: "center",
    borderRadius: 19,
    height: 38,
    justifyContent: "center",
    marginLeft: "auto",
    width: 38,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.18)",
  },
  sheetCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    maxHeight: "58%",
    minHeight: 220,
    paddingBottom: spacing[4],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
  },
  sheetCloseButton: {
    alignItems: "center",
    justifyContent: "center",
    height: 28,
    width: 28,
  },
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing[2],
  },
  sheetLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  sheetOption: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing[2],
    minHeight: 58,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
  },
  sheetOptionCheck: {
    fontSize: 18,
    fontWeight: "700",
  },
  sheetOptionCopy: {
    flex: 1,
    gap: 2,
  },
  sheetOptionDescription: {
    fontSize: 12,
    lineHeight: 17,
  },
  sheetOptions: {
    gap: spacing[2],
    paddingBottom: spacing[2],
  },
  sheetOptionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  streamingRow: {
    marginTop: spacing[2],
  },
  userBubble: {
    alignSelf: "flex-end",
    borderRadius: 18,
    borderWidth: 1,
    maxWidth: "84%",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  userMarkdownHeading: {
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 19,
  },
  userMarkdownParagraph: {
    fontSize: 14,
    lineHeight: 18,
  },
});
