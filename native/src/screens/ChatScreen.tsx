import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { RouteProp } from "@react-navigation/native";
import { useNavigation, useRoute } from "@react-navigation/native";
import {
  ArrowUp,
  BookOpen,
  BriefcaseBusiness,
  Calculator,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  EllipsisVertical,
  Globe,
  Image as ImageIcon,
  Lock,
  MessageSquare,
  Paperclip,
  PencilLine,
  Plus,
  Share2,
  Square,
  Trash2,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  Animated,
  ActivityIndicator,
  type GestureResponderEvent,
  Easing,
  FlatList,
  type FlatList as FlatListType,
  Keyboard,
  type KeyboardEvent,
  type LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  Image as RNImage,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from "react-native";
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_BASE_URL, api } from "@/api/client";
import type {
  ChatHistoryItem,
  ChatMessage,
  ChatMessagePart,
  IconPromptAction,
  IconPromptSuggestion,
  UploadedAttachment,
} from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { AppSidebar } from "@/components/AppSidebar";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { useUserAvatar } from "@/hooks/useUserAvatar";
import { refreshChatHistory } from "@/lib/chat-history-store";
import type { MainTabParamList } from "@/navigation/types";
import { radius, spacing } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";
import { DEFAULT_AVATAR_BACKGROUND } from "@/utils/avatar";
import { generateUUID } from "@/utils/id";

type LocalMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  images?: MessageImage[];
  isImageGenerating?: boolean;
  createdAt?: string;
};

type MessageImage = {
  url: string;
  mediaType?: string | null;
  filename?: string | null;
};

type GroupedHistory = {
  today: ChatHistoryItem[];
  yesterday: ChatHistoryItem[];
  lastWeek: ChatHistoryItem[];
  lastMonth: ChatHistoryItem[];
  older: ChatHistoryItem[];
};

const INITIAL_MESSAGE_LIMIT = 8;
const OLDER_MESSAGE_LIMIT = 12;
const SEND_RELOAD_RETRIES = 4;
const MESSAGE_OVERLAY_CLEARANCE = 88;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SIDEBAR_CLOSED_TRANSLATE_X = -336;
const IMAGE_PROMPT_PLACEHOLDER = "Enter image prompt here...";

function textFromMessage(message: ChatMessage) {
  if (message.content) {
    return message.content;
  }
  return (
    message.parts
      ?.map((part) => (part.type === "text" ? part.text : ""))
      .filter(Boolean)
      .join("\n") ?? ""
  );
}

export function ChatScreen() {
  const { bootstrap, changeLanguage, refresh, session, signOutUser } = useAuth();
  const { mode, palette, toggleTheme } = useAppTheme();
  const navigation =
    useNavigation<BottomTabNavigationProp<MainTabParamList, "Chat">>();
  const route = useRoute<RouteProp<MainTabParamList, "Chat">>();
  const { avatarInitial, avatarUrl } = useUserAvatar(session);
  const insets = useSafeAreaInsets();
  const bottomSafePadding =
    Math.max(insets.bottom, Platform.OS === "web" ? 18 : 28) + 22;
  const composerBottomPadding = 14;
  const [chatId, setChatId] = useState(generateUUID());
  const [history, setHistory] = useState<ChatHistoryItem[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyCursorId, setHistoryCursorId] = useState<string | null>(null);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);
  const [activeHistoryMenuId, setActiveHistoryMenuId] = useState<string | null>(
    null
  );
  const [deleteHistoryItem, setDeleteHistoryItem] =
    useState<ChatHistoryItem | null>(null);
  const [isDeletingChat, setIsDeletingChat] = useState(false);
  const [visibilityUpdatingChatId, setVisibilityUpdatingChatId] = useState<
    string | null
  >(null);
  const [historyActionStatus, setHistoryActionStatus] = useState<string | null>(
    null
  );
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [editingPendingMessageId, setEditingPendingMessageId] = useState<
    string | null
  >(null);
  const [editingError, setEditingError] = useState<string | null>(null);
  const [messageActionTarget, setMessageActionTarget] =
    useState<LocalMessage | null>(null);
  const [messageActionPoint, setMessageActionPoint] = useState({
    x: 24,
    y: 120,
  });
  const [selectedTextMessage, setSelectedTextMessage] =
    useState<LocalMessage | null>(null);
  const [selectedImage, setSelectedImage] = useState<MessageImage | null>(null);
  const [viewerImageUri, setViewerImageUri] = useState<string | null>(null);
  const [isDownloadingImage, setIsDownloadingImage] = useState(false);
  const [imageDownloadStatus, setImageDownloadStatus] = useState<string | null>(
    null
  );
  const [pendingMessageAction, setPendingMessageAction] = useState<
    "copy" | null
  >(null);
  const [copyToastVisible, setCopyToastVisible] = useState(false);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isResettingChat, setIsResettingChat] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [messageHasMore, setMessageHasMore] = useState(false);
  const [oldestMessageAt, setOldestMessageAt] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [selectedModelId, setSelectedModelId] = useState(
    bootstrap?.modelConfig.defaultModelId ?? bootstrap?.modelConfig.models[0]?.id ?? ""
  );
  const [selectedLanguage, setSelectedLanguage] = useState(
    bootstrap?.chat.languages.find((language) => language.isDefault)?.code ??
      bootstrap?.i18n.activeLanguage.code ??
      "en"
  );
  const [visibility] = useState<"private" | "public">("private");
  const [isSending, setIsSending] = useState(false);
  const [isImageGenerationSelected, setIsImageGenerationSelected] =
    useState(false);
  const [activeIconPromptId, setActiveIconPromptId] = useState<string | null>(
    null
  );
  const [iconPromptSuggestions, setIconPromptSuggestions] = useState<
    IconPromptSuggestion[]
  >([]);
  const [
    selectedIconPromptSuggestionKey,
    setSelectedIconPromptSuggestionKey,
  ] = useState<string | null>(null);
  const [insertedIconPromptText, setInsertedIconPromptText] = useState<
    string | null
  >(null);
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const [bottomAreaHeight, setBottomAreaHeight] = useState(182);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isSidebarInteractive, setIsSidebarInteractive] = useState(false);
  const [isUserMenuVisible, setIsUserMenuVisible] = useState(false);
  const [isComposerLanguageVisible, setIsComposerLanguageVisible] = useState(false);
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [isResourcesMenuOpen, setIsResourcesMenuOpen] = useState(false);
  const [pendingLanguageCode, setPendingLanguageCode] = useState<string | null>(
    null
  );
  const abortRef = useRef<AbortController | null>(null);
  const composerInputRef = useRef<TextInput | null>(null);
  const inlineEditInputRef = useRef<TextInput | null>(null);
  const messagesListRef = useRef<FlatListType<LocalMessage> | null>(null);
  const activeChatRequestRef = useRef(0);
  const shouldStickToBottomRef = useRef(true);
  const isStreamingResponseRef = useRef(false);
  const isUserScrollingMessagesRef = useRef(false);
  const streamingAutoScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const messagesScrollMetricsRef = useRef({
    contentHeight: 0,
    offsetY: 0,
    viewportHeight: 0,
  });
  const spinnerValue = useRef(new Animated.Value(0)).current;
  const sidebarTranslateX = useRef(
    new Animated.Value(SIDEBAR_CLOSED_TRANSLATE_X)
  ).current;
  const sidebarBackdropOpacity = sidebarTranslateX.interpolate({
    inputRange: [SIDEBAR_CLOSED_TRANSLATE_X, 0],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const userMenuScale = useRef(new Animated.Value(0.96)).current;
  const userMenuOpacity = useRef(new Animated.Value(0)).current;
  const composerLanguageScale = useRef(new Animated.Value(0.96)).current;
  const composerLanguageOpacity = useRef(new Animated.Value(0)).current;
  const messageActionScale = useRef(new Animated.Value(0.96)).current;
  const messageActionOpacity = useRef(new Animated.Value(0)).current;

  const prompts = bootstrap?.chat.suggestedPrompts ?? [];
  const iconPrompts = bootstrap?.chat.iconPromptActions ?? [];
  const models = bootstrap?.modelConfig.models ?? [];
  const languages = bootstrap?.chat.languages ?? [];

  const scrollToLatestMessage = useCallback((animated = false) => {
    requestAnimationFrame(() => {
      messagesListRef.current?.scrollToEnd({ animated });
      setTimeout(() => {
        messagesListRef.current?.scrollToEnd({ animated: false });
      }, 80);
    });
  }, []);

  const scheduleStreamingAutoScroll = useCallback(
    (animated = false) => {
      if (!isStreamingResponseRef.current && !shouldStickToBottomRef.current) {
        return;
      }
      if (streamingAutoScrollTimeoutRef.current) {
        return;
      }
      streamingAutoScrollTimeoutRef.current = setTimeout(() => {
        streamingAutoScrollTimeoutRef.current = null;
        scrollToLatestMessage(animated);
      }, 24);
    },
    [scrollToLatestMessage]
  );

  useEffect(
    () => () => {
      if (streamingAutoScrollTimeoutRef.current) {
        clearTimeout(streamingAutoScrollTimeoutRef.current);
      }
    },
    []
  );

  const mergeHistory = useCallback((current: ChatHistoryItem[], incoming: ChatHistoryItem[]) => {
    const seen = new Set<string>();
    const merged: ChatHistoryItem[] = [];
    for (const item of [...current, ...incoming]) {
      if (seen.has(item.id)) {
        continue;
      }
      seen.add(item.id);
      merged.push(item);
    }
    return merged;
  }, []);

  const loadHistoryPage = useCallback(
    async (endingBefore?: string | null) => {
      const result = await api.chatHistory({
        endingBefore,
        limit: 20,
        mode: "all",
      });
      const nextChats = result.chats ?? [];
      setHistory((current) =>
        endingBefore ? mergeHistory(current, nextChats) : nextChats
      );
      setHistoryHasMore(Boolean(result.hasMore));
      const lastItem = nextChats[nextChats.length - 1] ?? null;
      setHistoryCursorId(lastItem?.id ?? endingBefore ?? null);
    },
    [mergeHistory]
  );

  useEffect(() => {
    if (Platform.OS === "web") {
      return;
    }

    const handleKeyboardShow = (event: KeyboardEvent) => {
      setKeyboardHeight(event.endCoordinates.height);
      setIsComposerLanguageVisible(false);
      composerLanguageScale.setValue(0.96);
      composerLanguageOpacity.setValue(0);
    };
    const handleKeyboardHide = () => {
      setKeyboardHeight(0);
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
  }, [composerLanguageOpacity, composerLanguageScale]);

  const loadMoreHistory = useCallback(async () => {
    if (!historyHasMore || isLoadingMoreHistory || !historyCursorId) {
      return;
    }
    setIsLoadingMoreHistory(true);
    try {
      await loadHistoryPage(historyCursorId);
    } finally {
      setIsLoadingMoreHistory(false);
    }
  }, [historyCursorId, historyHasMore, isLoadingMoreHistory, loadHistoryPage]);

  const loadChatPage = useCallback(
    async ({
      before,
      limit,
      mode,
      targetChatId,
    }: {
      before?: string | null;
      limit: number;
      mode: "replace" | "prepend";
      targetChatId: string;
    }) => {
      const requestId = ++activeChatRequestRef.current;
      if (mode === "replace") {
        shouldStickToBottomRef.current = true;
        setIsLoadingChat(true);
        setChatError(null);
      } else {
        shouldStickToBottomRef.current = false;
        setIsLoadingOlderMessages(true);
      }

      try {
        const result = await api.chatMessages(targetChatId, { before, limit });
        if (requestId !== activeChatRequestRef.current && mode === "replace") {
          return result;
        }
        const nextMessages = messagesFromApi(result.messages);
        if (mode === "replace") {
          setMessages(nextMessages);
          scrollToLatestMessage(false);
        } else {
          setMessages((current) => mergeMessagePages(nextMessages, current));
        }
        setMessageHasMore(Boolean(result.hasMore));
        setOldestMessageAt(result.oldestMessageAt ?? null);
        return result;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to load chat.";
        if (mode === "replace") {
          setMessages([]);
          setChatError(message);
        } else {
          setChatError(message);
        }
        throw error;
      } finally {
        if (mode === "replace") {
          setIsLoadingChat(false);
        } else {
          setIsLoadingOlderMessages(false);
        }
      }
    },
    [scrollToLatestMessage]
  );

  const openChat = useCallback(
    (id: string) => {
      setActiveHistoryMenuId(null);
      setActiveIconPromptId(null);
      setIconPromptSuggestions([]);
      setSelectedIconPromptSuggestionKey(null);
      setInsertedIconPromptText(null);
      setChatId(id);
      setIsSidebarInteractive(false);
      loadChatPage({
        targetChatId: id,
        limit: INITIAL_MESSAGE_LIMIT,
        mode: "replace",
      }).catch(() => undefined);
    },
    [loadChatPage]
  );

  const openHistoryItem = useCallback(
    (item: ChatHistoryItem) => {
      if (item.mode === "jobs") {
        setActiveHistoryMenuId(null);
        setIsSidebarInteractive(false);
        navigation.navigate("Jobs", {
          chatId: item.id,
          openAsk: true,
        });
        return;
      }

      openChat(item.id);
    },
    [navigation, openChat]
  );

  const loadOlderMessages = useCallback(() => {
    if (
      isLoadingChat ||
      isLoadingOlderMessages ||
      isSending ||
      !messageHasMore ||
      !oldestMessageAt ||
      messages.length === 0
    ) {
      return;
    }
    loadChatPage({
      targetChatId: chatId,
      before: oldestMessageAt,
      limit: OLDER_MESSAGE_LIMIT,
      mode: "prepend",
    }).catch(() => undefined);
  }, [
    chatId,
    isLoadingChat,
    isLoadingOlderMessages,
    isSending,
    loadChatPage,
    messageHasMore,
    messages.length,
    oldestMessageAt,
  ]);

  const shareChat = useCallback(
    async (item: ChatHistoryItem, visibility: "private" | "public") => {
      if (visibilityUpdatingChatId) {
        return;
      }
      setVisibilityUpdatingChatId(item.id);
      setHistoryActionStatus(null);
      try {
        await api.updateChatVisibility(item.id, visibility);
        setHistory((current) =>
          current.map((chat) =>
            chat.id === item.id ? { ...chat, visibility } : chat
          )
        );
        if (visibility === "public") {
          await Share.share({
            message: `${item.title || "Chat"}\n${API_BASE_URL}/chat/${item.id}`,
            url: `${API_BASE_URL}/chat/${item.id}`,
            title: item.title || "Chat",
          });
        }
        setHistoryActionStatus(
          visibility === "public"
            ? "Chat sharing is now public."
            : "Chat sharing is now private."
        );
        setActiveHistoryMenuId(null);
      } catch (error) {
        setHistoryActionStatus(
          error instanceof Error
            ? error.message
            : "Unable to update sharing for this chat."
        );
      } finally {
        setVisibilityUpdatingChatId(null);
      }
    },
    [visibilityUpdatingChatId]
  );

  const confirmDeleteChat = useCallback(async () => {
    if (!deleteHistoryItem || isDeletingChat) {
      return;
    }
    const itemToDelete = deleteHistoryItem;
    const previousHistory = history;
    setIsDeletingChat(true);
    setDeleteHistoryItem(null);
    setActiveHistoryMenuId(null);
    setHistory((current) =>
      current.filter((chat) => chat.id !== itemToDelete.id)
    );
    if (chatId === itemToDelete.id) {
      activeChatRequestRef.current += 1;
      setChatId(generateUUID());
      setMessages([]);
      setMessageHasMore(false);
      setOldestMessageAt(null);
      setChatError(null);
    }
    setHistoryActionStatus(null);
    try {
      await api.deleteChat(itemToDelete.id);
      setHistoryActionStatus("Chat deleted.");
    } catch (error) {
      setHistory(previousHistory);
      setHistoryActionStatus(
        error instanceof Error ? error.message : "Unable to delete chat."
      );
    } finally {
      setIsDeletingChat(false);
    }
  }, [chatId, deleteHistoryItem, history, isDeletingChat]);

  const displayName = useMemo(() => {
    const firstName = session?.user.firstName?.trim();
    if (firstName) {
      return firstName;
    }
    const fullName = session?.user.name?.trim();
    if (fullName) {
      return fullName.split(/\s+/)[0] ?? fullName;
    }
    return "there";
  }, [session?.user.firstName, session?.user.name]);
  const languageLabel =
    languages.find((language) => language.code === selectedLanguage)?.name ??
    "Khasi";
  const selectedModel = useMemo(
    () =>
      models.find((model) => model.id === selectedModelId) ??
      models[0] ?? {
        id: "fallback",
        name: "KhasiGPT",
        description: "",
        supportsReasoning: false,
      },
    [models, selectedModelId]
  );
  const interfaceLanguages = bootstrap?.i18n.languages ?? [];
  const activeInterfaceLanguageCode = bootstrap?.i18n.activeLanguage.code ?? null;
  const dictionary = bootstrap?.i18n.dictionary ?? {};
  const t = useCallback(
    (key: string, fallback: string) => dictionary[key] ?? fallback,
    [dictionary]
  );
  const resourceMenuItems = useMemo(
    () => [
      {
        label: t("user_menu.resources.about", "About Us"),
        screen: "About" as const,
      },
      {
        label: t("user_menu.resources.contact", "Contact Us"),
        screen: "Contact" as const,
      },
      {
        label: t("user_menu.resources.privacy", "Privacy Policy"),
        screen: "PrivacyPolicy" as const,
      },
      {
        label: t("user_menu.resources.terms", "Terms of Service"),
        screen: "TermsOfService" as const,
      },
    ],
    [t]
  );
  const fullDisplayName = useMemo(() => {
    const parts = [session?.user.firstName, session?.user.lastName]
      .map((part) => part?.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      return parts.join(" ");
    }
    return session?.user.name?.trim() || session?.user.email || "User";
  }, [
    session?.user.email,
    session?.user.firstName,
    session?.user.lastName,
    session?.user.name,
  ]);
  const planLabel = useMemo(() => {
    const plan = bootstrap?.billing.balance?.plan;
    if (!plan) {
      return t("user_menu.manage_subscriptions_status_fallback", "Free Plan");
    }
    const price =
      typeof plan.priceInPaise === "number"
        ? `₹${Math.round(plan.priceInPaise / 100).toLocaleString("en-IN")}`
        : null;
    return price ? `${plan.name} (${price})` : plan.name;
  }, [bootstrap?.billing.balance?.plan, t]);
  const imagePromptAction = useMemo(
    () => iconPrompts.find((action) => action.selectImageMode),
    [iconPrompts]
  );
  const activeIconPromptAction = useMemo(
    () =>
      activeIconPromptId
        ? iconPrompts.find((action) => action.id === activeIconPromptId)
        : null,
    [activeIconPromptId, iconPrompts]
  );
  const primaryPrompt = iconPrompts[0]?.label ?? "Shna dur";
  const secondaryPrompt = iconPrompts[1]?.label ?? "Thoh jingrwai";
  const greetingTitle = t("greeting.title", "Hi, {name}").replaceAll(
    "{name}",
    displayName
  );
  const greetingSubtitle = t(
    "greeting.subtitle",
    "How can I help you today?"
  );
  const inputPlaceholder = t("chat.input.placeholder", "Send a message...");
  const imageGeneration = bootstrap?.chat.imageGeneration ?? {
    enabled: false,
    canGenerate: false,
    requiresPaidCredits: false,
  };
  const imagePromptPlaceholder = t(
    "image.prompt.placeholder",
    IMAGE_PROMPT_PLACEHOLDER
  );
  const lyricsPromptPlaceholder = t(
    "lyrics.prompt.placeholder",
    "Enter lyrics details..."
  );
  const composerPlaceholder = isImageGenerationSelected
    ? imagePromptPlaceholder.toLowerCase().includes("banana astronaut")
      ? IMAGE_PROMPT_PLACEHOLDER
      : imagePromptPlaceholder
    : activeIconPromptAction && !activeIconPromptAction.selectImageMode
      ? lyricsPromptPlaceholder
    : inputPlaceholder;
  const disclaimerText = t(
    "chat.disclaimer.text",
    "KhasiGPT or other AI Models can make mistakes. Check important details."
  );
  const privacyLinkText = t(
    "chat.disclaimer.privacy_link",
    "See privacy policy."
  );
  const groupedHistory = useMemo(() => groupHistoryByDate(history), [history]);
  const historySections = useMemo(
    () =>
      [
        { key: "today", title: "Today", items: groupedHistory.today },
        { key: "yesterday", title: "Yesterday", items: groupedHistory.yesterday },
        { key: "last-week", title: "Last 7 days", items: groupedHistory.lastWeek },
        { key: "last-month", title: "Last 30 days", items: groupedHistory.lastMonth },
        {
          key: "older",
          title: "Older than last month",
          items: groupedHistory.older,
        },
      ].filter((section) => section.items.length > 0),
    [groupedHistory]
  );

  const startNewChat = useCallback(() => {
    activeChatRequestRef.current += 1;
    setIsResettingChat(true);
    setChatId(generateUUID());
    setMessages([]);
    setMessageHasMore(false);
    setOldestMessageAt(null);
    setChatError(null);
    setIsSidebarInteractive(false);
    setIsUserMenuVisible(false);
    setIsComposerLanguageVisible(false);
    setIsModelMenuOpen(false);
    setAttachments([]);
    setUploadQueue([]);
    setIsImageGenerationSelected(false);
    setActiveIconPromptId(null);
    setIconPromptSuggestions([]);
    setSelectedIconPromptSuggestionKey(null);
    setInsertedIconPromptText(null);
    requestAnimationFrame(() => {
      setIsResettingChat(false);
    });
  }, []);

  useEffect(() => {
    if (route.params?.newChat) {
      startNewChat();
      navigation.setParams({ newChat: undefined });
      return;
    }

    if (!route.params?.chatId) {
      return;
    }

    openChat(route.params.chatId);
    navigation.setParams({ chatId: undefined });
  }, [
    navigation,
    openChat,
    route.params?.chatId,
    route.params?.newChat,
    startNewChat,
  ]);

  const closeComposerLanguageMenu = useCallback(() => {
    if (!isComposerLanguageVisible) {
      return;
    }
    Animated.parallel([
      Animated.timing(composerLanguageScale, {
        toValue: 0.96,
        duration: 120,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(composerLanguageOpacity, {
        toValue: 0,
        duration: 120,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setIsComposerLanguageVisible(false);
      }
    });
  }, [composerLanguageOpacity, composerLanguageScale, isComposerLanguageVisible]);

  const openComposerLanguageMenu = useCallback(() => {
    setIsComposerLanguageVisible(true);
    composerLanguageScale.setValue(0.96);
    composerLanguageOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(composerLanguageScale, {
        toValue: 1,
        duration: 150,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(composerLanguageOpacity, {
        toValue: 1,
        duration: 150,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [composerLanguageOpacity, composerLanguageScale]);

  const closeUserMenu = useCallback(() => {
    if (!isUserMenuVisible) {
      return;
    }
    Animated.parallel([
      Animated.timing(userMenuScale, {
        toValue: 0.96,
        duration: 120,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(userMenuOpacity, {
        toValue: 0,
        duration: 120,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setIsUserMenuVisible(false);
        setIsLanguageMenuOpen(false);
        setIsResourcesMenuOpen(false);
      }
    });
  }, [isUserMenuVisible, userMenuOpacity, userMenuScale]);

  const openUserMenu = useCallback(() => {
    setIsUserMenuVisible(true);
    setIsLanguageMenuOpen(false);
    setIsResourcesMenuOpen(false);
    userMenuScale.setValue(0.96);
    userMenuOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(userMenuScale, {
        toValue: 1,
        duration: 150,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(userMenuOpacity, {
        toValue: 1,
        duration: 150,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [userMenuOpacity, userMenuScale]);

  const navigateFromUserMenu = useCallback(
    (screen: keyof MainTabParamList) => {
      setIsUserMenuVisible(false);
      setIsLanguageMenuOpen(false);
      setIsResourcesMenuOpen(false);
      setIsModelMenuOpen(false);
      closeComposerLanguageMenu();
      navigation.navigate(screen);
    },
    [closeComposerLanguageMenu, navigation]
  );

  const closeSidebar = useCallback(() => {
    setIsSidebarInteractive(false);
  }, []);

  const openSidebar = useCallback(() => {
    setIsSidebarInteractive(true);
  }, []);

  const openSidebarScreen = useCallback(
    (screen: keyof MainTabParamList) => {
      closeSidebar();
      navigation.navigate(screen);
    },
    [closeSidebar, navigation]
  );

  useEffect(() => {
    if (!activeInterfaceLanguageCode) {
      return;
    }
    if (!languages.some((language) => language.code === activeInterfaceLanguageCode)) {
      return;
    }
    setSelectedLanguage((current) =>
      current === activeInterfaceLanguageCode ? current : activeInterfaceLanguageCode
    );
  }, [activeInterfaceLanguageCode, languages]);

  const handleInterfaceLanguageSelect = useCallback(
    (code: string) => {
      if (pendingLanguageCode) {
        return;
      }
      setPendingLanguageCode(code);
      setIsLanguageMenuOpen(false);
      changeLanguage(code)
        .catch(() => undefined)
        .finally(() => setPendingLanguageCode(null));
    },
    [changeLanguage, pendingLanguageCode]
  );

  const handleComposerLanguageSelect = useCallback(
    (code: string) => {
      if (pendingLanguageCode) {
        return;
      }
      setPendingLanguageCode(code);
      setSelectedLanguage(code);
      closeComposerLanguageMenu();
      changeLanguage(code)
        .catch(() => undefined)
        .finally(() => setPendingLanguageCode(null));
    },
    [changeLanguage, closeComposerLanguageMenu, pendingLanguageCode]
  );

  const applyIconPromptText = useCallback(
    (action: Pick<IconPromptAction, "behavior" | "prompt">) => {
      const trimmedPrompt = action.prompt.trim();
      if (!trimmedPrompt) {
        return;
      }
      setInput((current) => {
        const existing = current ?? "";
        if (action.behavior === "append" && existing.trim().length > 0) {
          const separator = existing.endsWith(" ") ? "" : " ";
          return `${existing}${separator}${trimmedPrompt}`;
        }
        return trimmedPrompt;
      });
    },
    []
  );

  const clearInsertedIconPromptText = useCallback(() => {
    if (!insertedIconPromptText) {
      return;
    }
    setInput((current) =>
      current.trim() === insertedIconPromptText.trim() ? "" : current
    );
    setInsertedIconPromptText(null);
  }, [insertedIconPromptText]);

  const disableImageGenerationMode = useCallback(() => {
    clearInsertedIconPromptText();
    setIsImageGenerationSelected(false);
    setActiveIconPromptId(null);
    setIconPromptSuggestions([]);
    setSelectedIconPromptSuggestionKey(null);
    setInsertedIconPromptText(null);
    setAttachments([]);
  }, [clearInsertedIconPromptText]);

  const handleIconPromptSelect = useCallback(
    (action: IconPromptAction | undefined, fallbackPrompt: string) => {
      if (!action) {
        clearInsertedIconPromptText();
        setActiveIconPromptId(null);
        setIconPromptSuggestions([]);
        setSelectedIconPromptSuggestionKey(null);
        setInput(fallbackPrompt);
        setInsertedIconPromptText(null);
        return;
      }

      const isSameActionOpen =
        activeIconPromptId === action.id && iconPromptSuggestions.length > 0;
      if (isSameActionOpen) {
        clearInsertedIconPromptText();
        setActiveIconPromptId(null);
        setIconPromptSuggestions([]);
        setSelectedIconPromptSuggestionKey(null);
        if (action.selectImageMode) {
          setIsImageGenerationSelected(false);
          setAttachments([]);
        }
        return;
      }

      if (activeIconPromptId !== action.id) {
        clearInsertedIconPromptText();
      }

      if (action.selectImageMode) {
        setIsImageGenerationSelected(true);
      } else if (isImageGenerationSelected) {
        setIsImageGenerationSelected(false);
        setAttachments([]);
      }

      if (action.showSuggestions && action.suggestions.length > 0) {
        setActiveIconPromptId(action.id);
        setIconPromptSuggestions(action.suggestions);
        setSelectedIconPromptSuggestionKey(null);
        setInsertedIconPromptText(null);
        return;
      }

      setActiveIconPromptId(null);
      setIconPromptSuggestions([]);
      setSelectedIconPromptSuggestionKey(null);
      setInsertedIconPromptText(null);
      applyIconPromptText(action);
    },
    [
      activeIconPromptId,
      applyIconPromptText,
      clearInsertedIconPromptText,
      iconPromptSuggestions.length,
      isImageGenerationSelected,
    ]
  );

  const handleIconPromptSuggestionSelect = useCallback(
    (suggestion: IconPromptSuggestion, index: number) => {
      const visibleText = suggestion.label.trim();
      const hiddenText = suggestion.prompt.trim() || visibleText;
      const displayedPrompt = visibleText || hiddenText;
      if (!displayedPrompt) {
        return;
      }
      setInput(displayedPrompt);
      setInsertedIconPromptText(displayedPrompt);
      setSelectedIconPromptSuggestionKey(
        getIconPromptSuggestionKey(suggestion, index)
      );
      composerInputRef.current?.focus();
    },
    []
  );

  const streamUserMessage = useCallback(async ({
    assistantCountBeforeSend,
    assistantMessageId,
    messageCountBeforeSend,
    text,
    updateOptimisticMessages,
    userMessageId,
  }: {
    assistantCountBeforeSend: number;
    assistantMessageId: string;
    messageCountBeforeSend: number;
    text: string;
    updateOptimisticMessages: (current: LocalMessage[]) => LocalMessage[];
    userMessageId: string;
  }) => {
    setIsSending(true);
    setChatError(null);
    shouldStickToBottomRef.current = true;
    isStreamingResponseRef.current = true;
    isUserScrollingMessagesRef.current = false;
    setMessages(updateOptimisticMessages);
    scrollToLatestMessage(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const requestBody = JSON.stringify({
        id: chatId,
        message: {
          id: userMessageId,
          role: "user",
          parts: [{ type: "text", text }],
        },
        chatMode: "default",
        selectedChatModel: selectedModelId,
        selectedLanguage,
        selectedVisibilityType: visibility,
      });
      let eventBuffer = "";
      let streamedAssistantText = "";
      const commitStreamedAssistantText = () => {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? { ...message, text: streamedAssistantText }
              : message
          )
        );
        scheduleStreamingAutoScroll(false);
      };
      const processEventChunk = (eventChunk: string) => {
        const payload = parseSseDataPayload(eventChunk);
        if (!payload) {
          return;
        }

        if (payload.type === "text-delta") {
          streamedAssistantText += payload.delta;
          commitStreamedAssistantText();
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

      if (streamedAssistantText.trim().length > 0) {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? { ...message, text: streamedAssistantText }
              : message
          )
        );
        scrollToLatestMessage(false);
      }

      for (let attempt = 0; attempt < SEND_RELOAD_RETRIES; attempt += 1) {
        const result = await api.chatMessages(chatId, {
          limit: Math.max(INITIAL_MESSAGE_LIMIT, messageCountBeforeSend + 2),
        });
        const canonicalMessages = messagesFromApi(result.messages);
        const hasNewUserMessage = canonicalMessages.some(
          (message) => message.id === userMessageId
        );
        const assistantReplyCount = canonicalMessages.filter(
          (message) =>
            message.role === "assistant" && message.text.trim().length > 0
        ).length;
        if (hasNewUserMessage && assistantReplyCount > assistantCountBeforeSend) {
          setMessages(canonicalMessages);
          setMessageHasMore(Boolean(result.hasMore));
          setOldestMessageAt(result.oldestMessageAt ?? null);
          scrollToLatestMessage(false);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 450));
      }
      refresh().catch(() => undefined);
      refreshChatHistory().catch(() => undefined);
    } catch (error) {
      if (!controller.signal.aborted) {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  text:
                    error instanceof Error
                      ? error.message
                      : "Unable to complete the response.",
                }
              : message
          )
        );
      }
    } finally {
      setIsSending(false);
      isStreamingResponseRef.current = false;
      abortRef.current = null;
      scrollToLatestMessage(false);
    }
  }, [
    chatId,
    refresh,
    scheduleStreamingAutoScroll,
    scrollToLatestMessage,
    selectedLanguage,
    selectedModelId,
    visibility,
  ]);

  const generateImageFromPrompt = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || isSending || uploadQueue.length > 0) {
      return;
    }
    if (!imageGeneration.enabled) {
      setChatError(t("image.disabled", "Image generation is currently unavailable."));
      return;
    }
    if (!imageGeneration.canGenerate) {
      setChatError(
        imageGeneration.requiresPaidCredits
          ? t("image.actions.locked.free.description", "You are using free credits. Recharge to generate images.")
          : t("image.access.locked", "Image generation is available for users with active credits or a paid plan.")
      );
      navigation.navigate("Recharge");
      return;
    }

    const userMessageId = generateUUID();
    const assistantMessageId = generateUUID();
    const sourceImages = attachments
      .filter((attachment) => attachment.contentType.startsWith("image/"))
      .map((attachment) => ({
        url: attachment.url,
        mediaType: attachment.contentType,
        filename: attachment.name,
      }));

    setInput("");
    setActiveIconPromptId(null);
    setIconPromptSuggestions([]);
    setSelectedIconPromptSuggestionKey(null);
    setAttachments([]);
    setIsSending(true);
    setChatError(null);
    shouldStickToBottomRef.current = true;
    setMessages((current) => [
      ...current,
      {
        id: userMessageId,
        role: "user",
        text: prompt,
        images: sourceImages,
      },
      {
        id: assistantMessageId,
        role: "assistant",
        text: "",
        isImageGenerating: true,
      },
    ]);
    scrollToLatestMessage(true);

    try {
      const result = await api.generateImage({
        chatId,
        visibility,
        prompt,
        displayPrompt: prompt,
        userMessageId,
        imageUrls: sourceImages.map((image) => image.url),
      });
      const assistantMessage = result.assistantMessage;
      if (!assistantMessage) {
        throw new Error(t("image.generate.empty", "No image was returned. Try a different prompt."));
      }
      const [renderedAssistant] = messagesFromApi([assistantMessage]);
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? renderedAssistant ?? {
                ...message,
                text: t("image.generate.empty", "No image was returned. Try a different prompt."),
                isImageGenerating: false,
              }
            : message
        )
      );
      refresh().catch(() => undefined);
      refreshChatHistory().catch(() => undefined);
      loadHistoryPage().catch(() => undefined);
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                text:
                  error instanceof Error
                    ? error.message
                    : t("image.generate.failed", "Image generation failed. Please try again."),
                isImageGenerating: false,
              }
            : message
        )
      );
    } finally {
      setIsSending(false);
      scrollToLatestMessage(false);
    }
  }, [
    attachments,
    chatId,
    imageGeneration.canGenerate,
    imageGeneration.enabled,
    imageGeneration.requiresPaidCredits,
    input,
    isSending,
    loadHistoryPage,
    navigation,
    refresh,
    scrollToLatestMessage,
    t,
    uploadQueue.length,
    visibility,
  ]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isSending || uploadQueue.length > 0) {
      return;
    }

    if (isImageGenerationSelected || attachments.length > 0) {
      await generateImageFromPrompt();
      return;
    }

    const userMessageId = generateUUID();
    const assistantMessageId = generateUUID();
    const messageCountBeforeSend = messages.length;
    const assistantCountBeforeSend = messages.filter(
      (message) => message.role === "assistant" && message.text.trim().length > 0
    ).length;

    setInput("");
    setActiveIconPromptId(null);
    setIconPromptSuggestions([]);
    setSelectedIconPromptSuggestionKey(null);
    setInsertedIconPromptText(null);
    setEditingMessageId(null);
    setEditingDraft("");
    setEditingError(null);

    await streamUserMessage({
      assistantCountBeforeSend,
      assistantMessageId,
      messageCountBeforeSend,
      text,
      updateOptimisticMessages: (current) => [
        ...current,
        { id: userMessageId, role: "user", text },
        { id: assistantMessageId, role: "assistant", text: "" },
      ],
      userMessageId,
    });
  }, [
    attachments.length,
    generateImageFromPrompt,
    input,
    isImageGenerationSelected,
    isSending,
    messages,
    streamUserMessage,
    uploadQueue.length,
  ]);

  const beginInlineEdit = useCallback((item: LocalMessage) => {
    if (item.role !== "user" || isSending || editingPendingMessageId) {
      return;
    }

    setMessageActionTarget(null);
    closeComposerLanguageMenu();
    setEditingMessageId(item.id);
    setEditingDraft(item.text);
    setEditingError(null);
    requestAnimationFrame(() => {
      setTimeout(() => {
        inlineEditInputRef.current?.focus();
      }, 60);
    });
  }, [closeComposerLanguageMenu, editingPendingMessageId, isSending]);

  const openMessageActionMenu = useCallback(
    (item: LocalMessage, event: GestureResponderEvent) => {
      if (editingMessageId || editingPendingMessageId) {
        return;
      }
      Keyboard.dismiss();
      Vibration.vibrate(8);
      const { pageX, pageY } = event.nativeEvent;
      setMessageActionPoint({
        x: Math.max(12, pageX),
        y: Math.max(72, pageY),
      });
      setMessageActionTarget(item);
    },
    [editingMessageId, editingPendingMessageId]
  );

  const handleCopyMessage = useCallback(async () => {
    if (!messageActionTarget || pendingMessageAction) {
      return;
    }
    setPendingMessageAction("copy");
    try {
      await Clipboard.setStringAsync(messageActionTarget.text);
      setMessageActionTarget(null);
      setCopyToastVisible(true);
      setTimeout(() => {
        setCopyToastVisible(false);
      }, 1600);
    } finally {
      setPendingMessageAction(null);
    }
  }, [messageActionTarget, pendingMessageAction]);

  const handleSelectMessageText = useCallback(() => {
    if (!messageActionTarget) {
      return;
    }
    setSelectedTextMessage(messageActionTarget);
    setMessageActionTarget(null);
  }, [messageActionTarget]);

  const closeImageViewer = useCallback(() => {
    if (isDownloadingImage) {
      return;
    }
    setSelectedImage(null);
    setViewerImageUri(null);
    setImageDownloadStatus(null);
  }, [isDownloadingImage]);

  const openImageViewer = useCallback((image: MessageImage) => {
    setSelectedImage(image);
    setViewerImageUri(null);
    setImageDownloadStatus(null);
    requestAnimationFrame(() => {
      setViewerImageUri(image.url);
    });
  }, []);

  const downloadSelectedImage = useCallback(async () => {
    if (!selectedImage || isDownloadingImage) {
      return;
    }

    setIsDownloadingImage(true);
    setImageDownloadStatus(null);
    try {
      const filename = buildImageDownloadFilename(selectedImage);
      if (Platform.OS === "web") {
        const anchor = document.createElement("a");
        anchor.href = selectedImage.url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setImageDownloadStatus("Download started.");
        return;
      }

      const directory = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!directory) {
        throw new Error("Unable to access device storage.");
      }

      const fileUri = `${directory}${filename}`;
      const dataUrl = parseImageDataUrl(selectedImage.url);
      if (dataUrl) {
        await FileSystem.writeAsStringAsync(fileUri, dataUrl.base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        await FileSystem.downloadAsync(selectedImage.url, fileUri);
      }

      setImageDownloadStatus(`Saved to ${filename}`);
    } catch (error) {
      setImageDownloadStatus(
        error instanceof Error ? error.message : "Unable to download image."
      );
    } finally {
      setIsDownloadingImage(false);
    }
  }, [isDownloadingImage, selectedImage]);

  const handleEditMessageFromMenu = useCallback(() => {
    if (!messageActionTarget || messageActionTarget.role !== "user") {
      return;
    }
    beginInlineEdit(messageActionTarget);
  }, [beginInlineEdit, messageActionTarget]);

  const cancelInlineEdit = useCallback(() => {
    if (editingPendingMessageId) {
      return;
    }

    setEditingMessageId(null);
    setEditingDraft("");
    setEditingError(null);
  }, [editingPendingMessageId]);

  const saveInlineEdit = useCallback(
    async (item: LocalMessage) => {
      const text = editingDraft.trim();
      if (
        item.role !== "user" ||
        !text ||
        isSending ||
        editingPendingMessageId
      ) {
        return;
      }

      if (text === item.text.trim()) {
        cancelInlineEdit();
        return;
      }

      const editedMessageIndex = messages.findIndex(
        (message) => message.id === item.id
      );
      if (editedMessageIndex === -1) {
        setEditingError("Unable to find this message.");
        return;
      }

      const messagesBeforeEdit = messages.slice(0, editedMessageIndex);
      const assistantMessageId = generateUUID();
      const messageCountBeforeSend = messagesBeforeEdit.length + 1;
      const assistantCountBeforeSend = messagesBeforeEdit.filter(
        (message) =>
          message.role === "assistant" && message.text.trim().length > 0
      ).length;

      setEditingPendingMessageId(item.id);
      setEditingError(null);
      try {
        await api.deleteTrailingMessages(item.id);
        setEditingMessageId(null);
        setEditingDraft("");
        await streamUserMessage({
          assistantCountBeforeSend,
          assistantMessageId,
          messageCountBeforeSend,
          text,
          updateOptimisticMessages: () => [
            ...messagesBeforeEdit,
            { ...item, text },
            { id: assistantMessageId, role: "assistant", text: "" },
          ],
          userMessageId: item.id,
        });
      } catch (error) {
        setEditingError(
          error instanceof Error
            ? error.message
            : "Unable to update this message."
        );
      } finally {
        setEditingPendingMessageId(null);
      }
    },
    [
      cancelInlineEdit,
      editingDraft,
      editingPendingMessageId,
      isSending,
      messages,
      streamUserMessage,
    ]
  );

  const stop = () => {
    abortRef.current?.abort();
    setIsSending(false);
  };

  const pickAttachment = async () => {
    if (isSending || uploadQueue.length > 0) {
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: true,
      type: ["image/png", "image/jpeg"],
    });
    if (result.canceled) {
      return;
    }

    const assets = result.assets.filter((asset) =>
      (asset.mimeType ?? "").startsWith("image/")
    );
    if (assets.length === 0) {
      setChatError("Choose a PNG or JPG image.");
      return;
    }

    setIsImageGenerationSelected(true);
    setUploadQueue(assets.map((asset) => asset.name ?? "image"));
    setChatError(null);
    try {
      const uploaded = await Promise.all(
        assets.map((asset) =>
          api.uploadFile({
            uri: asset.uri,
            name: asset.name ?? `reference-${Date.now()}.jpg`,
            mimeType: asset.mimeType ?? "image/jpeg",
          })
        )
      );
      setAttachments((current) => [...current, ...uploaded]);
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : "Failed to upload image."
      );
    } finally {
      setUploadQueue([]);
    }
  };

  useEffect(() => {
    if (!messageActionTarget) {
      messageActionScale.setValue(0.96);
      messageActionOpacity.setValue(0);
      return;
    }

    messageActionScale.setValue(0.96);
    messageActionOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(messageActionScale, {
        toValue: 1,
        duration: 95,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(messageActionOpacity, {
        toValue: 1,
        duration: 70,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [messageActionOpacity, messageActionScale, messageActionTarget]);

  useEffect(() => {
    if (!pendingLanguageCode) {
      spinnerValue.stopAnimation();
      spinnerValue.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.timing(spinnerValue, {
        toValue: 1,
        duration: 850,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    animation.start();

    return () => {
      animation.stop();
      spinnerValue.stopAnimation();
    };
  }, [pendingLanguageCode, spinnerValue]);

  const spinnerRotate = spinnerValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const isInlineEditing = Boolean(editingMessageId);
  const shouldShowPromptPills =
    messages.length === 0 &&
    !isInlineEditing &&
    !isLoadingChat &&
    !isResettingChat;
  const shouldShowPromptSuggestions =
    shouldShowPromptPills && iconPromptSuggestions.length > 0;
  const composerBottomOffset = keyboardHeight;
  const visibleBottomPadding =
    keyboardHeight > 0 ? Math.max(insets.bottom, composerBottomPadding) : bottomSafePadding;
  const renderHistoryItem = (item: ChatHistoryItem, keyPrefix: string) => {
    const isMenuOpen = activeHistoryMenuId === item.id;
    const visibility = item.visibility ?? "private";
    const isVisibilityUpdating = visibilityUpdatingChatId === item.id;

    return (
      <View
        key={`${keyPrefix}-${item.id}`}
        style={[styles.sidebarHistoryItemWrap, isMenuOpen ? styles.sidebarHistoryItemActive : null]}
      >
        <View style={styles.sidebarHistoryRow}>
          <Pressable
            onPress={() => {
              closeSidebar();
              openHistoryItem(item);
            }}
            style={styles.sidebarHistoryOpenButton}
          >
            {item.mode === "jobs" ? (
              <BriefcaseBusiness color={palette.mutedForeground} size={13} />
            ) : item.mode === "study" ? (
              <BookOpen color={palette.mutedForeground} size={13} />
            ) : (
              <MessageSquare color={palette.mutedForeground} size={13} />
            )}
            <Text
              numberOfLines={1}
              style={[styles.sidebarHistoryText, { color: palette.mutedForeground }]}
            >
              {item.title || "New Chat"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              setActiveHistoryMenuId((current) =>
                current === item.id ? null : item.id
              )
            }
            style={styles.sidebarHistoryMenuButton}
          >
            <EllipsisVertical color={palette.mutedForeground} size={16} />
          </Pressable>
          </View>
        {isMenuOpen ? (
          <View
            style={[
              styles.historyActionMenu,
              { backgroundColor: palette.popover, borderColor: palette.border },
            ]}
          >
            <View style={styles.historyActionHeader}>
              <Share2 color={palette.foreground} size={15} />
              <Text style={[styles.historyActionText, { color: palette.foreground }]}>
                Share
              </Text>
            </View>
            <Pressable
              disabled={isVisibilityUpdating}
              onPress={() => shareChat(item, "private")}
              style={styles.historyActionSubItem}
            >
              <Lock color={palette.mutedForeground} size={13} />
              <Text
                style={[
                  styles.historyActionSubText,
                  { color: palette.mutedForeground },
                ]}
              >
                Private
              </Text>
              {visibility === "private" ? (
                <CheckCircle color={palette.foreground} size={14} />
              ) : null}
            </Pressable>
            <Pressable
              disabled={isVisibilityUpdating}
              onPress={() => shareChat(item, "public")}
              style={styles.historyActionSubItem}
            >
              <Globe color={palette.mutedForeground} size={13} />
              <Text
                style={[
                  styles.historyActionSubText,
                  { color: palette.mutedForeground },
                ]}
              >
                Public
              </Text>
              {isVisibilityUpdating ? (
                <ActivityIndicator color={palette.foreground} size="small" />
              ) : visibility === "public" ? (
                <CheckCircle color={palette.foreground} size={14} />
              ) : null}
            </Pressable>
            <View style={[styles.historyActionSeparator, { backgroundColor: palette.border }]} />
            <Pressable
              onPress={() => {
                setDeleteHistoryItem(item);
                setActiveHistoryMenuId(null);
              }}
              style={styles.historyActionDanger}
            >
              <Trash2 color={palette.destructive} size={15} />
              <Text style={[styles.historyActionText, { color: palette.destructive }]}>
                Delete
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <Screen padded={false} scroll={false} style={styles.screenRoot}>
      <PageHeader
        compact
        leftControl="sidebar"
        middleContent={
          <Pressable
            onPress={() => {
              setIsModelMenuOpen((value) => !value);
              closeSidebar();
              closeUserMenu();
              closeComposerLanguageMenu();
            }}
            style={styles.brandButton}
          >
            <Text
              numberOfLines={1}
              style={[styles.brandText, { color: palette.foreground }]}
            >
              {selectedModel.name}
            </Text>
            <ChevronDown color={palette.foreground} size={14} />
          </Pressable>
        }
        onSidebarPress={openSidebar}
        title={selectedModel.name}
        trailingContent={
          <Pressable
            onPress={startNewChat}
            style={[styles.newChatButton, { borderColor: palette.border }]}
          >
            <Plus color={palette.foreground} size={22} />
            <Text style={[styles.newChatText, { color: palette.foreground }]}>
              {t("chat.header.new_chat", "New Chat")}
            </Text>
          </Pressable>
        }
      />
      {isModelMenuOpen ? (
        <View style={styles.modelMenuLayer}>
          <Pressable
            onPress={() => {
              setIsModelMenuOpen(false);
              closeComposerLanguageMenu();
            }}
            style={styles.modelMenuBackdrop}
          />
          <View
            style={[
              styles.modelDropdown,
              { backgroundColor: palette.popover, borderColor: palette.border },
            ]}
          >
            {models.map((model) => {
              const isActive = model.id === selectedModelId;
              return (
                <Pressable
                  key={model.id}
                  onPress={() => {
                    setSelectedModelId(model.id);
                    setIsModelMenuOpen(false);
                    closeComposerLanguageMenu();
                  }}
                  style={[
                    styles.modelMenuItem,
                    isActive
                      ? { backgroundColor: palette.muted }
                      : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.modelMenuCheck,
                      { color: palette.foreground },
                    ]}
                  >
                    {isActive ? "✓" : ""}
                  </Text>
                  <View style={styles.modelMenuCopy}>
                    <Text
                      style={[
                        styles.modelMenuTitle,
                        { color: palette.foreground },
                      ]}
                    >
                      {model.name}
                    </Text>
                    {model.description ? (
                      <Text
                        style={[
                          styles.modelMenuDescription,
                          { color: palette.mutedForeground },
                        ]}
                      >
                        {model.description}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {isUserMenuVisible ? (
        <View style={styles.userMenuLayer}>
          <Pressable
            onPress={() => {
              closeUserMenu();
            }}
            style={styles.userMenuBackdrop}
          />
          <Animated.View
            style={[
              styles.userDropdown,
              { backgroundColor: palette.popover, borderColor: palette.border },
              {
                opacity: userMenuOpacity,
                transform: [{ scale: userMenuScale }],
              },
            ]}
          >
            <Pressable
              onPress={() => navigateFromUserMenu("Profile")}
              style={styles.userMenuItem}
            >
              <Text style={[styles.userMenuPrimary, { color: palette.foreground }]}>
                {fullDisplayName}
              </Text>
            </Pressable>
            <View style={[styles.userMenuSeparator, { backgroundColor: palette.border }]} />
            <Pressable
              onPress={() => navigateFromUserMenu("Profile")}
              style={styles.userMenuItem}
            >
              <Text style={[styles.userMenuText, { color: palette.foreground }]}>
                {t("user_menu.profile", "Profile")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => navigateFromUserMenu("Subscriptions")}
              style={styles.userMenuItemTall}
            >
              <Text style={[styles.userMenuText, { color: palette.foreground }]}>
                {t("user_menu.manage_subscriptions", "Manage Subscriptions")}
              </Text>
              <Text style={[styles.userMenuSubText, { color: palette.mutedForeground }]}>
                {planLabel}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => navigateFromUserMenu("Recharge")}
              style={styles.userMenuItem}
            >
              <Text style={[styles.userMenuText, { color: palette.foreground }]}>
                {t("user_menu.upgrade_plan", "Upgrade plan")}
              </Text>
            </Pressable>
            {bootstrap?.featureAccess.forum ? (
              <>
                <View
                  style={[styles.userMenuSeparator, { backgroundColor: palette.border }]}
                />
                <Pressable
                  onPress={() => navigateFromUserMenu("Forum")}
                  style={styles.userMenuItem}
                >
                  <Text style={[styles.userMenuText, { color: palette.foreground }]}>
                    {t("user_menu.community_forum", "Community Forum")}
                  </Text>
                </Pressable>
              </>
            ) : null}
            <View style={[styles.userMenuSeparator, { backgroundColor: palette.border }]} />
            <Pressable
              onPress={() => {
                setIsLanguageMenuOpen((value) => !value);
                setIsResourcesMenuOpen(false);
              }}
              style={styles.userMenuItemRow}
            >
              <Text style={[styles.userMenuText, { color: palette.foreground }]}>
                {t("user_menu.language", "Language")}
              </Text>
              {isLanguageMenuOpen ? (
                <ChevronDown color={palette.foreground} size={16} />
              ) : (
                <ChevronRight color={palette.foreground} size={16} />
              )}
            </Pressable>
            {isLanguageMenuOpen ? (
              <View style={styles.userSubMenu}>
                {interfaceLanguages
                  .filter((language) => language.isActive)
                  .map((language) => (
                    <Pressable
                      key={language.code}
                      disabled={Boolean(pendingLanguageCode)}
                      onPress={() => handleInterfaceLanguageSelect(language.code)}
                      style={styles.userSubMenuItem}
                    >
                      <Text
                        style={[
                          styles.userMenuSubText,
                          { color: palette.mutedForeground },
                        ]}
                      >
                        {language.name}
                        {language.code === activeInterfaceLanguageCode
                          ? `  ${
                              pendingLanguageCode === language.code
                                ? t("user_menu.language.updating", "Updating...")
                                : t("user_menu.language.active", "Active")
                            }`
                          : ""}
                      </Text>
                    </Pressable>
                  ))}
              </View>
            ) : null}
            <Pressable
              onPress={() => {
                setIsResourcesMenuOpen((value) => !value);
                setIsLanguageMenuOpen(false);
              }}
              style={styles.userMenuItemRow}
            >
              <Text style={[styles.userMenuText, { color: palette.foreground }]}>
                {t("user_menu.resources", "Resources")}
              </Text>
              {isResourcesMenuOpen ? (
                <ChevronDown color={palette.foreground} size={16} />
              ) : (
                <ChevronRight color={palette.foreground} size={16} />
              )}
            </Pressable>
            {isResourcesMenuOpen ? (
              <View style={styles.userSubMenu}>
                {resourceMenuItems.map((item) => (
                  <Pressable
                    key={item.screen}
                    onPress={() => navigateFromUserMenu(item.screen)}
                    style={styles.userSubMenuItem}
                  >
                    <Text
                      style={[
                        styles.userMenuSubText,
                        { color: palette.mutedForeground },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={[styles.userMenuSeparator, { backgroundColor: palette.border }]} />
            <Pressable onPress={toggleTheme} style={styles.userMenuItem}>
              <Text style={[styles.userMenuText, { color: palette.foreground }]}>
                {mode === "dark"
                  ? t("user_menu.theme.light", "Light mode")
                  : t("user_menu.theme.dark", "Dark mode")}
              </Text>
            </Pressable>
            <View style={[styles.userMenuSeparator, { backgroundColor: palette.border }]} />
            <Pressable
              onPress={() => {
                closeUserMenu();
                signOutUser().catch(() => undefined);
              }}
              style={styles.userMenuItem}
            >
              <Text style={[styles.userMenuText, { color: palette.destructive }]}>
                {t("user_menu.sign_out", "Sign out")}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}

      <FlatList
        ref={messagesListRef}
        style={styles.messagesList}
        contentContainerStyle={[
          styles.messagesContent,
          {
            paddingBottom:
              bottomAreaHeight + composerBottomOffset + MESSAGE_OVERLAY_CLEARANCE,
          },
          messages.length === 0 ? styles.emptyMessagesContent : null,
        ]}
        data={messages}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          messages.length > 0 ? (
            <View style={styles.messagesTopStatus}>
              {isLoadingOlderMessages ? (
                <ActivityIndicator color={palette.mutedForeground} size="small" />
              ) : messageHasMore ? (
                <Text style={[styles.messagesTopHint, { color: palette.mutedForeground }]}>
                  Pull up to load older messages
                </Text>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyHome}>
            {isLoadingChat ? (
              <ActivityIndicator color={palette.foreground} />
            ) : chatError ? (
              <>
                <Text style={[styles.greetingTitle, { color: palette.foreground }]}>
                  Unable to load chat
                </Text>
                <Text style={[styles.greetingSub, { color: palette.mutedForeground }]}>
                  {chatError}
                </Text>
              </>
            ) : (
              <>
                <Text style={[styles.greetingTitle, { color: palette.foreground }]}>
                  {greetingTitle}
                </Text>
                <Text style={[styles.greetingSub, { color: palette.mutedForeground }]}>
                  {greetingSubtitle}
                </Text>
              </>
            )}
          </View>
        }
        maintainVisibleContentPosition={{
          minIndexForVisible: 0,
        }}
        onContentSizeChange={(_, contentHeight) => {
          messagesScrollMetricsRef.current.contentHeight = contentHeight;
          if (shouldStickToBottomRef.current) {
            scheduleStreamingAutoScroll(false);
          }
        }}
        onLayout={(event) => {
          messagesScrollMetricsRef.current.viewportHeight =
            event.nativeEvent.layout.height;
        }}
        onScroll={({ nativeEvent }) => {
          const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
          const remaining =
            contentSize.height - (contentOffset.y + layoutMeasurement.height);
          const isNearBottom = remaining < 180;
          messagesScrollMetricsRef.current = {
            contentHeight: contentSize.height,
            offsetY: contentOffset.y,
            viewportHeight: layoutMeasurement.height,
          };

          if (isStreamingResponseRef.current) {
            shouldStickToBottomRef.current = true;
            return;
          }

          if (isUserScrollingMessagesRef.current) {
            shouldStickToBottomRef.current = isNearBottom;
          }

          const canLoadOlder =
            contentSize.height > layoutMeasurement.height + 72;
          if (
            isUserScrollingMessagesRef.current &&
            canLoadOlder &&
            contentOffset.y < 72
          ) {
            loadOlderMessages();
          }
        }}
        onScrollBeginDrag={() => {
          isUserScrollingMessagesRef.current = true;
        }}
        onScrollEndDrag={({ nativeEvent }) => {
          const remaining =
            nativeEvent.contentSize.height -
            (nativeEvent.contentOffset.y + nativeEvent.layoutMeasurement.height);
          shouldStickToBottomRef.current = remaining < 180;
          isUserScrollingMessagesRef.current = false;
        }}
        onMomentumScrollEnd={({ nativeEvent }) => {
          const remaining =
            nativeEvent.contentSize.height -
            (nativeEvent.contentOffset.y + nativeEvent.layoutMeasurement.height);
          shouldStickToBottomRef.current = remaining < 180;
          isUserScrollingMessagesRef.current = false;
        }}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <View
            style={[
              styles.messageRow,
              item.role === "user" ? styles.userRow : styles.assistantRow,
            ]}
          >
            <View
              style={[
                styles.messageColumn,
                item.role === "user"
                  ? styles.userMessageColumn
                  : styles.assistantMessageColumn,
                item.role === "user" && editingMessageId === item.id
                  ? styles.userMessageColumnEditing
                  : null,
              ]}
            >
              <View
                style={[
                  item.role === "user"
                    ? [
                        styles.userMessageBubble,
                        editingMessageId === item.id
                          ? styles.userMessageBubbleEditing
                          : null,
                        {
                          backgroundColor:
                            editingMessageId === item.id
                              ? "transparent"
                              : palette.muted,
                          borderColor:
                            editingMessageId === item.id
                              ? "transparent"
                              : palette.border,
                        },
                      ]
                    : styles.assistantMessageBody,
                ]}
                pointerEvents={
                  item.role === "user" && editingMessageId !== item.id
                    ? "box-only"
                    : "auto"
                }
              >
                {item.role === "user" && editingMessageId === item.id ? (
                  <View style={styles.inlineEditor}>
                    <TextInput
                      editable={editingPendingMessageId !== item.id}
                      multiline
                      onChangeText={setEditingDraft}
                      placeholder="Edit message..."
                      placeholderTextColor={palette.mutedForeground}
                      ref={inlineEditInputRef}
                      style={[
                        styles.inlineEditorInput,
                        {
                          backgroundColor: palette.background,
                          borderColor: palette.border,
                          color: palette.foreground,
                        },
                      ]}
                      value={editingDraft}
                    />
                    {editingError ? (
                      <Text style={[styles.inlineEditorError, { color: palette.destructive }]}>
                        {editingError}
                      </Text>
                    ) : null}
                    <View style={styles.inlineEditorActions}>
                      <Pressable
                        disabled={editingPendingMessageId === item.id}
                        onPress={cancelInlineEdit}
                        style={[
                          styles.inlineEditorSecondaryButton,
                          { borderColor: palette.border },
                          editingPendingMessageId === item.id
                            ? styles.inlineEditorButtonDisabled
                            : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.inlineEditorSecondaryText,
                            { color: palette.foreground },
                          ]}
                        >
                          cancel
                        </Text>
                      </Pressable>
                      <Pressable
                        disabled={
                          editingPendingMessageId === item.id ||
                          !editingDraft.trim()
                        }
                        onPress={() => saveInlineEdit(item)}
                        style={[
                          styles.inlineEditorPrimaryButton,
                          {
                            backgroundColor:
                              editingPendingMessageId === item.id ||
                              !editingDraft.trim()
                                ? palette.muted
                                : palette.primary,
                          },
                        ]}
                      >
                        {editingPendingMessageId === item.id ? (
                          <ActivityIndicator
                            color={palette.mutedForeground}
                            size="small"
                          />
                        ) : null}
                        <Text
                          style={[
                            styles.inlineEditorPrimaryText,
                            {
                              color:
                                editingPendingMessageId === item.id ||
                                !editingDraft.trim()
                                  ? palette.mutedForeground
                                  : palette.primaryForeground,
                            },
                          ]}
                        >
                          {editingPendingMessageId === item.id
                            ? "Saving..."
                            : "Send"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    disabled={
                      Boolean(editingMessageId) ||
                      Boolean(editingPendingMessageId)
                    }
                    delayLongPress={150}
                    onLongPress={(event) => openMessageActionMenu(item, event)}
                    style={item.role === "user" ? styles.userMessagePressTarget : null}
                  >
                    {item.images && item.images.length > 0 ? (
                      <View
                        style={[
                          styles.messageImageGrid,
                          item.role === "user"
                            ? styles.userMessageImageGrid
                            : null,
                        ]}
                      >
                        {item.images.map((image) => (
                          <Pressable
                            key={image.url}
                            onPressIn={() => {
                              openImageViewer(image);
                            }}
                            style={styles.messageImageButton}
                          >
                            <RNImage
                              resizeMode="cover"
                              source={{ uri: image.url }}
                              style={[
                                styles.messageImage,
                                { backgroundColor: palette.muted },
                              ]}
                            />
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    {item.isImageGenerating ? (
                      <ImageGenerationWave />
                    ) : item.text.trim() || !item.images?.length ? (
                      <MarkdownMessage
                        color={palette.foreground}
                        text={item.text}
                        variant={item.role === "user" ? "user" : "assistant"}
                      />
                    ) : null}
                  </Pressable>
                )}
                {item.role === "assistant" &&
                isSending &&
                !item.isImageGenerating &&
                messages.at(-1)?.id === item.id ? (
                  <View style={styles.assistantStreamingIndicator}>
                    <ActivityIndicator color={palette.mutedForeground} size="small" />
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        )}
      />

      {shouldShowPromptPills ? (
        <View
          style={[
            styles.promptOverlay,
            {
              bottom: bottomAreaHeight + composerBottomOffset + 12,
            },
          ]}
        >
          <View style={styles.promptRow}>
          <Pressable
            onPress={() =>
              handleIconPromptSelect(
                iconPrompts[0],
                prompts[0] || primaryPrompt
              )
            }
            style={[
              styles.promptPill,
              { backgroundColor: palette.background, borderColor: palette.border },
            ]}
          >
            <ImageIcon color="#6fcf97" size={16} />
            <Text style={[styles.promptPillText, { color: palette.foreground }]}>
              {primaryPrompt}
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              handleIconPromptSelect(
                iconPrompts[1],
                prompts[1] || secondaryPrompt
              )
            }
            style={[
              styles.promptPill,
              { backgroundColor: palette.background, borderColor: palette.border },
            ]}
          >
            <Text style={styles.documentIcon}>▧</Text>
            <Text style={[styles.promptPillText, { color: palette.foreground }]}>
              {secondaryPrompt}
            </Text>
          </Pressable>
          </View>
          {shouldShowPromptSuggestions ? (
            <View
              style={[
                styles.promptSuggestions,
                { backgroundColor: palette.background },
              ]}
            >
              {iconPromptSuggestions.map((suggestion, index) => (
                (() => {
                  const suggestionKey = getIconPromptSuggestionKey(
                    suggestion,
                    index
                  );
                  const isSelected =
                    selectedIconPromptSuggestionKey === suggestionKey;
                  return (
                    <Pressable
                      key={suggestionKey}
                      onPress={() =>
                        handleIconPromptSuggestionSelect(suggestion, index)
                      }
                      style={[
                        styles.promptSuggestionButton,
                        isSelected
                          ? { backgroundColor: palette.muted }
                          : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.promptSuggestionText,
                          {
                            color: isSelected
                              ? palette.foreground
                              : palette.mutedForeground,
                          },
                        ]}
                      >
                        {suggestion.label}
                      </Text>
                      {isSelected ? (
                        <CheckCircle color={palette.primary} size={16} />
                      ) : null}
                    </Pressable>
                  );
                })()
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {isComposerLanguageVisible && !isInlineEditing ? (
        <Pressable
          onPress={closeComposerLanguageMenu}
          style={[
            styles.composerLanguageDismissArea,
            {
              bottom: bottomAreaHeight + composerBottomOffset,
            },
          ]}
        />
      ) : null}

      {!isInlineEditing ? (
      <View
        onLayout={(event: LayoutChangeEvent) => {
          setBottomAreaHeight(event.nativeEvent.layout.height);
        }}
        style={[
          styles.bottomArea,
          {
            bottom: composerBottomOffset,
            paddingBottom: visibleBottomPadding,
          },
        ]}
      >
        <View
          pointerEvents="none"
          style={[
            styles.bottomAreaMask,
            { backgroundColor: palette.background },
          ]}
        />
        <View
          style={[
            styles.composer,
            { backgroundColor: palette.card, borderColor: palette.border },
          ]}
        >
          <TextInput
            ref={composerInputRef}
            multiline
            onChangeText={setInput}
            onFocus={closeComposerLanguageMenu}
            placeholder={composerPlaceholder}
            placeholderTextColor={palette.mutedForeground}
            style={[styles.input, { color: palette.foreground }]}
            value={input}
          />
          {attachments.length > 0 || uploadQueue.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.attachmentPreviewScroller}
              contentContainerStyle={styles.attachmentPreviewRow}
            >
              {attachments.map((attachment) => (
                <View
                  key={attachment.url}
                  style={[
                    styles.attachmentPreview,
                    { borderColor: palette.border, backgroundColor: palette.muted },
                  ]}
                >
                  <RNImage
                    source={{ uri: attachment.url }}
                    style={styles.attachmentPreviewImage}
                  />
                  <Pressable
                    onPress={() =>
                      setAttachments((current) =>
                        current.filter((item) => item.url !== attachment.url)
                      )
                    }
                    style={[
                      styles.attachmentRemoveButton,
                      { backgroundColor: palette.background },
                    ]}
                  >
                    <X color={palette.foreground} size={13} />
                  </Pressable>
                </View>
              ))}
              {uploadQueue.map((filename) => (
                <View
                  key={filename}
                  style={[
                    styles.attachmentPreview,
                    styles.attachmentUploading,
                    { borderColor: palette.border, backgroundColor: palette.muted },
                  ]}
                >
                  <ImageIcon color={palette.mutedForeground} size={18} />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.attachmentUploadingText,
                      { color: palette.mutedForeground },
                    ]}
                  >
                    {filename}
                  </Text>
                </View>
              ))}
            </ScrollView>
          ) : null}
          <View style={styles.composerToolbar}>
            <Pressable
              disabled={isSending || uploadQueue.length > 0}
              onPress={() => {
                closeComposerLanguageMenu();
                void pickAttachment();
              }}
              style={[
                styles.toolbarItem,
                isSending || uploadQueue.length > 0 ? styles.disabledButton : null,
              ]}
            >
              {uploadQueue.length > 0 ? (
                <ActivityIndicator color={palette.foreground} size="small" />
              ) : (
                <Paperclip color={palette.foreground} size={18} />
              )}
            </Pressable>
            <Pressable
              disabled={isSending || uploadQueue.length > 0}
              onPress={() => {
                if (!imageGeneration.enabled) {
                  setChatError(t("image.disabled", "Image generation is currently unavailable."));
                  return;
                }
                if (!imageGeneration.canGenerate) {
                  navigation.navigate("Recharge");
                  return;
                }
                if (isImageGenerationSelected) {
                  disableImageGenerationMode();
                  return;
                }
                if (imagePromptAction) {
                  handleIconPromptSelect(imagePromptAction, imagePromptAction.prompt);
                  return;
                }
                setIsImageGenerationSelected(true);
                setActiveIconPromptId(null);
                setIconPromptSuggestions([]);
                setSelectedIconPromptSuggestionKey(null);
                setInsertedIconPromptText(null);
              }}
              style={[
                styles.toolbarItem,
                isImageGenerationSelected
                  ? [
                      styles.imageModeActive,
                      {
                        backgroundColor: palette.muted,
                        borderColor: palette.border,
                      },
                    ]
                  : isSending || uploadQueue.length > 0
                    ? styles.disabledButton
                  : null,
              ]}
            >
              <ImageIcon color={palette.foreground} size={16} />
              <Text style={[styles.toolbarText, { color: palette.foreground }]}>
                Generate image
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (pendingLanguageCode) {
                  return;
                }
                if (isComposerLanguageVisible) {
                  closeComposerLanguageMenu();
                  return;
                }
                closeUserMenu();
                setIsModelMenuOpen(false);
                openComposerLanguageMenu();
              }}
              style={styles.toolbarItem}
            >
              <Globe color={palette.foreground} size={17} />
              <Text style={[styles.toolbarText, { color: palette.foreground }]}>
                {languageLabel}
              </Text>
              <ChevronDown color={palette.foreground} size={13} />
            </Pressable>
            <View style={styles.toolbarSpacer} />
            <Pressable
              disabled={!isSending && (!input.trim() || uploadQueue.length > 0)}
              onPress={() => {
                closeComposerLanguageMenu();
                if (isSending) {
                  stop();
                  return;
                }
                void send();
              }}
              style={[
                styles.sendButton,
                {
                  backgroundColor:
                    input.trim() && uploadQueue.length === 0
                      ? palette.primary
                      : palette.muted,
                },
              ]}
            >
              {isSending ? (
                <Square color={palette.primaryForeground} size={16} />
              ) : input.trim() && uploadQueue.length === 0 ? (
                <ArrowUp color={palette.primaryForeground} size={18} />
              ) : (
                <ArrowUp color={palette.mutedForeground} size={18} />
              )}
            </Pressable>
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
                  disabled={Boolean(pendingLanguageCode)}
                  onPress={() => handleComposerLanguageSelect(language.code)}
                  style={styles.composerLanguageItem}
                >
                  <Text
                    style={[
                      styles.composerLanguageCheck,
                      { color: palette.foreground },
                    ]}
                  >
                    {language.code === selectedLanguage ? "✓" : ""}
                  </Text>
                  <Text
                    style={[
                      styles.composerLanguageText,
                      { color: palette.foreground },
                    ]}
                  >
                    {language.name}
                  </Text>
                  {language.code === selectedLanguage ? (
                    <Text
                      style={[
                        styles.composerLanguageActive,
                        { color: palette.mutedForeground },
                      ]}
                    >
                      {pendingLanguageCode === language.code
                        ? t("user_menu.language.updating", "Updating...")
                        : t("user_menu.language.active", "Active")}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </Animated.View>
          ) : null}
        </View>
        <Text style={[styles.disclaimer, { color: palette.mutedForeground }]}>
          {disclaimerText} {privacyLinkText}
        </Text>
      </View>
      ) : null}
      {pendingLanguageCode ? (
        <View style={styles.languageOverlay}>
          <View style={styles.languageBlurLayer} />
          <View
            style={[
              styles.languageLoadingCard,
              { backgroundColor: palette.background, borderColor: palette.border },
            ]}
          >
            <Animated.View
              style={[
                styles.languageLoadingSpinner,
                {
                  borderColor: palette.foreground,
                  transform: [{ rotate: spinnerRotate }],
                },
              ]}
            />
            <Text style={[styles.languageLoadingTitle, { color: palette.foreground }]}>
              {t("chat.language.ui_prompt.loading", "Switching interface language...")}
            </Text>
          </View>
        </View>
      ) : null}
      {copyToastVisible ? (
        <View style={styles.copyToastWrap} pointerEvents="none">
          <View
            style={[
              styles.copyToast,
              { backgroundColor: palette.background, borderColor: palette.border },
            ]}
          >
            <CheckCircle color={palette.foreground} size={18} />
            <Text style={[styles.copyToastText, { color: palette.foreground }]}>
              Copied to clipboard!
            </Text>
          </View>
        </View>
      ) : null}
      <Modal
        animationType="none"
        onRequestClose={() => {
          if (!pendingMessageAction) {
            setMessageActionTarget(null);
          }
        }}
        transparent
        visible={Boolean(messageActionTarget)}
      >
        <View style={styles.messageActionOverlay}>
          <Pressable
            disabled={Boolean(pendingMessageAction)}
            onPress={() => setMessageActionTarget(null)}
            style={styles.messageActionBackdrop}
          />
          <Animated.View
            style={[
              styles.messageActionSheet,
              {
                backgroundColor: palette.background,
                left: Math.min(Math.max(12, messageActionPoint.x - 86), 220),
                top: Math.max(76, messageActionPoint.y + 28),
                opacity: messageActionOpacity,
                transform: [{ scale: messageActionScale }],
              },
            ]}
          >
            <Text
              style={[
                styles.messageActionTimestamp,
                { color: palette.mutedForeground },
              ]}
            >
              Message options
            </Text>
            {messageActionTarget?.role === "user" ? (
              <Pressable
                disabled={Boolean(pendingMessageAction)}
                onPress={handleEditMessageFromMenu}
                style={styles.messageActionRow}
              >
                <PencilLine color={palette.foreground} size={18} />
                <Text
                  style={[styles.messageActionLabel, { color: palette.foreground }]}
                >
                  Edit Message
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              disabled={Boolean(pendingMessageAction)}
              onPress={handleCopyMessage}
              style={styles.messageActionRow}
            >
              {pendingMessageAction === "copy" ? (
                <ActivityIndicator color={palette.foreground} size="small" />
              ) : (
                <Copy color={palette.foreground} size={18} />
              )}
              <Text style={[styles.messageActionLabel, { color: palette.foreground }]}>
                {pendingMessageAction === "copy" ? "Copying..." : "Copy"}
              </Text>
            </Pressable>
            <Pressable
              disabled={Boolean(pendingMessageAction)}
              onPress={handleSelectMessageText}
              style={styles.messageActionRow}
            >
              <MessageSquare color={palette.foreground} size={18} />
              <Text style={[styles.messageActionLabel, { color: palette.foreground }]}>
                Select Text
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        onRequestClose={() => setSelectedTextMessage(null)}
        transparent
        visible={Boolean(selectedTextMessage)}
      >
        <View style={styles.selectTextOverlay}>
          <Pressable
            onPress={() => setSelectedTextMessage(null)}
            style={styles.messageActionBackdrop}
          />
          <View
            style={[
              styles.selectTextCard,
              { backgroundColor: palette.background, borderColor: palette.border },
            ]}
          >
            <Text style={[styles.selectTextTitle, { color: palette.foreground }]}>
              Select Text
            </Text>
            <Text
              selectable
              style={[styles.selectTextBody, { color: palette.foreground }]}
            >
              {selectedTextMessage?.text}
            </Text>
          </View>
        </View>
      </Modal>
      {selectedImage ? (
        <View style={styles.imageViewerOverlay}>
          <Pressable
            disabled={isDownloadingImage}
            onPress={closeImageViewer}
            style={styles.imageViewerBackdrop}
          />
          <View style={styles.imageViewerContent}>
            <View style={styles.imageViewerChrome}>
              <Pressable
                disabled={isDownloadingImage}
                onPress={closeImageViewer}
                style={styles.imageViewerIconButton}
              >
                <X color="#fff" size={23} />
              </Pressable>
              <Pressable
                disabled={isDownloadingImage}
                onPress={downloadSelectedImage}
                style={styles.imageViewerIconButton}
              >
                {isDownloadingImage ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Download color="#fff" size={21} />
                )}
              </Pressable>
            </View>
            {viewerImageUri ? (
              <ZoomableImage
                key={viewerImageUri}
                uri={viewerImageUri}
              />
            ) : (
              <View style={styles.imageViewerImageStage}>
                <ActivityIndicator color="#fff" size="large" />
              </View>
            )}
          </View>
          {imageDownloadStatus ? (
            <View
              style={[
                styles.imageViewerStatus,
                { bottom: Math.max(insets.bottom + 22, 36) },
              ]}
            >
              <Text style={styles.imageViewerStatusText}>
                {imageDownloadStatus}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <AppSidebar
        onClose={closeSidebar}
        visible={isSidebarInteractive}
      />
    </Screen>
  );
}

function groupHistoryByDate(history: ChatHistoryItem[]): GroupedHistory {
  const now = new Date();
  const oneWeekAgo = new Date(now);
  oneWeekAgo.setDate(now.getDate() - 7);
  const oneMonthAgo = new Date(now);
  oneMonthAgo.setMonth(now.getMonth() - 1);

  return history.reduce(
    (groups, item) => {
      const rawDate = item.createdAt ?? item.updatedAt;
      const chatDate = rawDate ? new Date(rawDate) : null;
      const timestamp = chatDate?.getTime() ?? Number.NaN;

      if (!Number.isFinite(timestamp) || !chatDate) {
        groups.older.push(item);
        return groups;
      }

      const ageMs = now.getTime() - timestamp;

      if (ageMs < ONE_DAY_MS) {
        groups.today.push(item);
      } else if (ageMs < ONE_DAY_MS * 2) {
        groups.yesterday.push(item);
      } else if (chatDate > oneWeekAgo) {
        groups.lastWeek.push(item);
      } else if (chatDate > oneMonthAgo) {
        groups.lastMonth.push(item);
      } else {
        groups.older.push(item);
      }

      return groups;
    },
    {
      today: [],
      yesterday: [],
      lastWeek: [],
      lastMonth: [],
      older: [],
    } as GroupedHistory
  );
}

function getIconPromptSuggestionKey(
  suggestion: IconPromptSuggestion,
  index: number
) {
  return `${suggestion.label}-${suggestion.prompt}-${index}`;
}

function messagesFromApi(messages: ChatMessage[]): LocalMessage[] {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => {
      const images =
        message.parts
          ?.filter(isImageFilePart)
          .map((part) => ({
            url: part.url as string,
            mediaType:
              typeof part.mediaType === "string" ? part.mediaType : null,
            filename:
              typeof part.filename === "string" ? part.filename : null,
          })) ?? [];

      return {
        id: message.id,
        role: message.role as "user" | "assistant",
        text: textFromMessage(message),
        images,
        createdAt: message.createdAt,
      };
    });
}

function isImageFilePart(
  part: ChatMessagePart
): part is Extract<ChatMessagePart, { type: "file" }> {
  if (part.type !== "file" || typeof part.url !== "string") {
    return false;
  }
  return (
    typeof part.mediaType !== "string" ||
    part.mediaType.startsWith("image/") ||
    part.url.startsWith("data:image/")
  );
}

function mergeMessagePages(
  olderMessages: LocalMessage[],
  newerMessages: LocalMessage[]
) {
  const seen = new Set<string>();
  const merged: LocalMessage[] = [];
  for (const message of [...olderMessages, ...newerMessages]) {
    if (seen.has(message.id)) {
      continue;
    }
    seen.add(message.id);
    merged.push(message);
  }
  return merged;
}

function parseImageDataUrl(url: string) {
  const match = url.match(/^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/i);
  if (!match) {
    return null;
  }
  return {
    mediaType: match[1].toLowerCase(),
    base64: match[2],
  };
}

function buildImageDownloadFilename(image: MessageImage) {
  const baseName =
    image.filename?.replace(/\.[a-z0-9]+$/i, "") || "khasigpt-image";
  const safeBaseName =
    baseName
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^[-_]+|[-_]+$/g, "") || "khasigpt-image";
  const dataUrl = parseImageDataUrl(image.url);
  const mediaType = image.mediaType ?? dataUrl?.mediaType ?? "";
  const extension = mediaType.includes("png") ? "png" : "jpg";
  return `${safeBaseName}-${Date.now()}.${extension}`;
}

function ZoomableImage({ uri }: { uri: string }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const reset = () => {
    "worklet";
    scale.value = withSpring(1, { damping: 18, stiffness: 180 });
    savedScale.value = 1;
    translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
    translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      const nextScale = Math.min(Math.max(savedScale.value * event.scale, 1), 4);
      scale.value = nextScale;
    })
    .onEnd(() => {
      if (scale.value <= 1.02) {
        reset();
        return;
      }
      savedScale.value = scale.value;
    });

  const panGesture = Gesture.Pan()
    .minDistance(2)
    .onUpdate((event) => {
      if (scale.value <= 1) {
        return;
      }
      translateX.value = savedTranslateX.value + event.translationX;
      translateY.value = savedTranslateY.value + event.translationY;
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        reset();
        return;
      }
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(220)
    .onEnd(() => {
      if (scale.value > 1.02) {
        reset();
        return;
      }
      scale.value = withSpring(2, { damping: 18, stiffness: 180 });
      savedScale.value = 2;
      translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
      translateY.value = withSpring(0, { damping: 18, stiffness: 180 });
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    });

  const composedGesture = Gesture.Simultaneous(
    doubleTapGesture,
    Gesture.Simultaneous(pinchGesture, panGesture)
  );

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composedGesture}>
      <View style={styles.imageViewerImageStage}>
        <Reanimated.Image
          fadeDuration={0}
          resizeMode="contain"
          source={{ uri }}
          style={[styles.imageViewerImage, imageStyle]}
        />
      </View>
    </GestureDetector>
  );
}

function ImageGenerationWave() {
  const { palette } = useAppTheme();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 920,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 920,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.62, 1],
  });
  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-18, 18],
  });
  const scale = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.985, 1.015],
  });

  return (
    <View style={styles.imageGenerationWave}>
      <View
        style={[
          styles.imageGenerationSkeletonFrame,
          { backgroundColor: palette.muted, borderColor: palette.border },
        ]}
      >
        <Animated.View
          style={[
            styles.imageGenerationSkeleton,
            {
              backgroundColor: palette.mutedForeground,
              opacity,
              transform: [{ translateX }, { scale }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.imageGenerationHighlight,
            {
              opacity,
              transform: [{ translateX }],
            },
          ]}
        />
      </View>
      <Text style={[styles.imageGenerationText, { color: palette.mutedForeground }]}>
        Generating image...
      </Text>
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
    blocks.push({ type: "code", content: code.join("\n"), language: codeLanguage });
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
      | { type: "text-start"; id: string }
      | { type: "text-delta"; id: string; delta: string }
      | { type: "text-end"; id: string }
      | { type: "error"; errorText?: string }
      | { type: string; [key: string]: unknown };
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
  },
  header: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  iconButton: {
    height: 32,
    width: 32,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  brandButton: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  brandText: {
    fontSize: 16,
    fontWeight: "500",
    flexShrink: 1,
    maxWidth: 170,
  },
  headerSpacer: {
    flex: 1,
    minWidth: 4,
  },
  newChatButton: {
    minHeight: 32,
    borderWidth: 1,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 11,
    flexShrink: 0,
  },
  newChatText: {
    fontSize: 18,
    fontWeight: "600",
  },
  userMenuPill: {
    height: 34,
    minWidth: 62,
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 5,
    paddingRight: 2,
  },
  userMenuDots: {
    width: 22,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  messagesContent: {
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 210,
    gap: spacing[3],
  },
  messagesList: {
    flex: 1,
    zIndex: 0,
  },
  emptyMessagesContent: {
    justifyContent: "center",
  },
  emptyHome: {
    flex: 1,
    justifyContent: "center",
    gap: 13,
    paddingBottom: 150,
  },
  greetingTitle: {
    fontSize: 23,
    fontWeight: "700",
    textAlign: "center",
  },
  greetingSub: {
    textAlign: "center",
    fontSize: 23,
    lineHeight: 32,
  },
  messageRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  userRow: {
    justifyContent: "flex-end",
  },
  assistantRow: {
    justifyContent: "flex-start",
  },
  messageColumn: {
    maxWidth: "100%",
  },
  userMessageColumn: {
    alignItems: "flex-end",
    maxWidth: "78%",
  },
  userMessageColumnEditing: {
    alignItems: "stretch",
    maxWidth: "100%",
    width: "100%",
  },
  assistantMessageColumn: {
    alignItems: "flex-start",
    width: "100%",
  },
  userMessageBubble: {
    minHeight: 34,
    maxWidth: "100%",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignSelf: "flex-end",
  },
  userMessageBubbleEditing: {
    alignSelf: "stretch",
    borderWidth: 0,
    borderRadius: 0,
    width: "100%",
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  userMessagePressTarget: {
    minWidth: 0,
  },
  inlineEditor: {
    gap: spacing[2],
    width: "100%",
  },
  inlineEditorInput: {
    minHeight: 82,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[3],
    paddingVertical: 10,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: "top",
  },
  inlineEditorError: {
    fontSize: 12,
    lineHeight: 17,
  },
  inlineEditorActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing[2],
  },
  inlineEditorSecondaryButton: {
    minHeight: 38,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[4],
  },
  inlineEditorPrimaryButton: {
    minHeight: 38,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
  },
  inlineEditorButtonDisabled: {
    opacity: 0.7,
  },
  inlineEditorSecondaryText: {
    fontSize: 15,
    fontWeight: "600",
  },
  inlineEditorPrimaryText: {
    fontSize: 15,
    fontWeight: "700",
  },
  assistantMessageBody: {
    maxWidth: "92%",
    paddingLeft: 2,
    paddingRight: 20,
  },
  assistantStreamingIndicator: {
    paddingTop: 8,
  },
  messageImageGrid: {
    width: "100%",
    gap: 8,
    marginBottom: 8,
  },
  userMessageImageGrid: {
    alignItems: "flex-end",
  },
  messageImageButton: {
    borderRadius: 12,
  },
  messageImage: {
    width: 238,
    height: 238,
    maxWidth: "100%",
    borderRadius: 12,
  },
  imageGenerationWave: {
    width: 246,
    maxWidth: "100%",
    gap: 12,
    paddingVertical: 4,
  },
  imageGenerationSkeletonFrame: {
    borderWidth: 1,
    height: 154,
    borderRadius: 14,
    overflow: "hidden",
  },
  imageGenerationSkeleton: {
    ...StyleSheet.absoluteFillObject,
  },
  imageGenerationHighlight: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "38%",
    width: "24%",
    backgroundColor: "rgba(255,255,255,0.58)",
  },
  imageGenerationText: {
    fontSize: 13,
    fontWeight: "600",
  },
  imageViewerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 120,
    elevation: 120,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 24,
  },
  imageViewerBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  imageViewerContent: {
    width: "100%",
    height: "88%",
    zIndex: 1,
    gap: 8,
  },
  imageViewerChrome: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  imageViewerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  imageViewerDownloadButton: {
    minHeight: 42,
    borderRadius: 21,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
  },
  imageViewerDownloadText: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
  },
  imageViewerImageStage: {
    width: "100%",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  imageViewerImage: {
    width: "100%",
    height: "100%",
  },
  imageViewerStatus: {
    position: "absolute",
    left: 18,
    right: 18,
    minHeight: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  imageViewerStatusText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  markdownRoot: {
    gap: 8,
  },
  markdownParagraph: {
    fontSize: 15,
    lineHeight: 22,
  },
  userMarkdownParagraph: {
    fontSize: 14,
    lineHeight: 18,
  },
  markdownHeading: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "700",
  },
  userMarkdownHeading: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "700",
  },
  markdownList: {
    gap: 5,
  },
  markdownListRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
  },
  markdownBullet: {
    fontSize: 15,
    lineHeight: 22,
  },
  inlineStrong: {
    fontWeight: "700",
  },
  inlineCode: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    fontSize: 14,
    backgroundColor: "rgba(148, 163, 184, 0.18)",
  },
  codeBlock: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
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
  actions: {
    flexDirection: "row",
    gap: 16,
    alignItems: "center",
    marginTop: 10,
  },
  userActions: {
    justifyContent: "flex-end",
  },
  assistantActions: {
    justifyContent: "flex-start",
    paddingLeft: 2,
  },
  messageActionButton: {
    minHeight: 22,
    minWidth: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  messageActionButtonDisabled: {
    opacity: 0.45,
  },
  messagesTopStatus: {
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  messagesTopHint: {
    fontSize: 12,
  },
  promptOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    gap: 16,
  },
  promptRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  promptSuggestions: {
    alignSelf: "stretch",
    marginHorizontal: 10,
    borderRadius: 8,
    paddingVertical: 6,
  },
  promptSuggestionButton: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  promptSuggestionText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  promptPill: {
    height: 41,
    minWidth: 118,
    borderWidth: 1,
    borderRadius: 21,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  promptPillText: {
    fontSize: 17,
    fontWeight: "600",
  },
  documentIcon: {
    color: "#60a5fa",
    fontSize: 17,
    fontWeight: "700",
  },
  bottomArea: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingTop: 0,
    gap: 10,
    zIndex: 30,
    elevation: 30,
  },
  bottomAreaMask: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 0,
  },
  composer: {
    minHeight: 124,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
    zIndex: 1,
  },
  input: {
    minHeight: 52,
    maxHeight: 86,
    fontSize: 16,
    textAlignVertical: "top",
  },
  attachmentPreviewScroller: {
    marginBottom: 10,
    maxHeight: 72,
  },
  attachmentPreviewRow: {
    gap: 8,
    alignItems: "center",
    paddingRight: 8,
  },
  attachmentPreview: {
    width: 64,
    height: 64,
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentPreviewImage: {
    width: "100%",
    height: "100%",
  },
  attachmentRemoveButton: {
    position: "absolute",
    right: 4,
    top: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentUploading: {
    gap: 4,
    paddingHorizontal: 5,
  },
  attachmentUploadingText: {
    maxWidth: 54,
    fontSize: 10,
  },
  composerToolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  toolbarItem: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  toolbarText: {
    fontSize: 15,
    fontWeight: "500",
  },
  imageModeActive: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 8,
  },
  toolbarSpacer: {
    flex: 1,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
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
  composerLanguageDismissArea: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 44,
    zIndex: 2,
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
  disclaimer: {
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 14,
    zIndex: 1,
  },
  languageOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 60,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 38,
  },
  languageBlurLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.74)",
  },
  languageLoadingCard: {
    width: "100%",
    maxWidth: 330,
    minHeight: 96,
    borderWidth: 1,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 12,
  },
  languageLoadingSpinner: {
    width: 31,
    height: 31,
    borderRadius: 16,
    borderWidth: 2,
    borderTopColor: "transparent",
  },
  languageLoadingTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  copyToastWrap: {
    position: "absolute",
    top: 54,
    left: 0,
    right: 0,
    zIndex: 70,
    alignItems: "center",
  },
  copyToast: {
    minHeight: 48,
    minWidth: 270,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 16,
  },
  copyToastText: {
    fontSize: 15,
    fontWeight: "600",
  },
  messageActionOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  messageActionBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  messageActionSheet: {
    position: "absolute",
    width: 214,
    borderRadius: 18,
    paddingVertical: spacing[2],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 18,
  },
  messageActionTimestamp: {
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[1],
  },
  messageActionRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
  },
  messageActionLabel: {
    fontSize: 15,
    fontWeight: "600",
  },
  selectTextOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[5],
  },
  selectTextCard: {
    width: "100%",
    maxHeight: "70%",
    borderWidth: 1,
    borderRadius: 20,
    padding: spacing[4],
    gap: spacing[3],
  },
  selectTextTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  selectTextBody: {
    fontSize: 16,
    lineHeight: 24,
  },
  modelMenuLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 46,
  },
  modelMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  modelDropdown: {
    position: "absolute",
    top: 49,
    left: 38,
    right: 18,
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 8,
  },
  modelMenuItem: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  modelMenuCheck: {
    width: 14,
    fontSize: 16,
    fontWeight: "700",
  },
  modelMenuCopy: {
    flex: 1,
    gap: 2,
  },
  modelMenuTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  modelMenuDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  userMenuLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 45,
  },
  userMenuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  userDropdown: {
    position: "absolute",
    top: 48,
    right: 10,
    width: 256,
    borderWidth: 1,
    borderRadius: 4,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 8,
  },
  userMenuItem: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  userMenuItemTall: {
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: 12,
    gap: 2,
  },
  userMenuItemRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  userMenuPrimary: {
    fontSize: 16,
    fontWeight: "700",
  },
  userMenuText: {
    fontSize: 16,
  },
  userMenuSubText: {
    fontSize: 14,
  },
  userMenuSeparator: {
    height: 1,
  },
  userSubMenu: {
    paddingBottom: 4,
  },
  userSubMenuItem: {
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  sidebarOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  sidebarBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sidebarBackdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.74)",
  },
  sidebarPanel: {
    width: 288,
    maxWidth: "74%",
    height: "100%",
    paddingTop: 16,
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 12,
  },
  sidebarBrandRow: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sidebarLogo: {
    width: 23,
    height: 23,
  },
  sidebarBrandText: {
    fontSize: 21,
    fontWeight: "700",
  },
  sidebarFeatureList: {
    marginTop: 32,
    gap: 18,
  },
  sidebarFeatureRow: {
    minHeight: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sidebarFeatureText: {
    fontSize: 17,
    fontWeight: "500",
  },
  sidebarSeparator: {
    height: 1,
    marginTop: 18,
    marginBottom: 17,
  },
  sidebarHistoryContent: {
    paddingHorizontal: 16,
    paddingBottom: 26,
  },
  sidebarSectionTitle: {
    color: "#9ca3af",
    fontSize: 14,
    marginBottom: 12,
  },
  sidebarDateTitle: {
    color: "#9ca3af",
    fontSize: 14,
    marginBottom: 11,
  },
  sidebarHistorySection: {
    marginTop: 24,
  },
  sidebarHistoryRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sidebarHistoryItemWrap: {
    position: "relative",
    zIndex: 1,
  },
  sidebarHistoryItemActive: {
    zIndex: 20,
  },
  sidebarHistoryOpenButton: {
    minHeight: 32,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sidebarHistoryMenuButton: {
    minHeight: 32,
    minWidth: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  sidebarHistoryText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 23,
  },
  historyActionMenu: {
    position: "absolute",
    top: 30,
    right: 0,
    width: 188,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 12,
    zIndex: 5,
  },
  historyActionHeader: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
  },
  historyActionSubItem: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingLeft: 30,
    paddingRight: 12,
  },
  historyActionDanger: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
  },
  historyActionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  historyActionSubText: {
    flex: 1,
    fontSize: 14,
  },
  historyActionSeparator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
  },
  sidebarActionStatus: {
    paddingHorizontal: 2,
    paddingTop: 8,
    fontSize: 13,
    lineHeight: 18,
  },
  sidebarLoadingText: {
    fontSize: 14,
    paddingVertical: 14,
    textAlign: "center",
  },
  confirmOverlay: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.62)",
    paddingHorizontal: 18,
  },
  confirmDialog: {
    borderRadius: 2,
    paddingHorizontal: 26,
    paddingVertical: 28,
    gap: 12,
  },
  confirmTitle: {
    textAlign: "center",
    fontSize: 20,
    fontWeight: "700",
  },
  confirmDescription: {
    textAlign: "center",
    fontSize: 16,
    lineHeight: 23,
  },
  confirmPrimaryButton: {
    minHeight: 42,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  confirmPrimaryText: {
    fontSize: 16,
    fontWeight: "700",
  },
  confirmSecondaryButton: {
    minHeight: 42,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmSecondaryText: {
    fontSize: 16,
    fontWeight: "500",
  },
  disabledButton: {
    opacity: 0.65,
  },
});
