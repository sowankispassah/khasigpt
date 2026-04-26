import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image as RNImage,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  BookOpen,
  BriefcaseBusiness,
  Calculator,
  CheckCircle,
  EllipsisVertical,
  Globe,
  Lock,
  MessageSquare,
  Plus,
  Share2,
  Trash2,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_BASE_URL, api } from "@/api/client";
import type { ChatHistoryItem } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import {
  ensureChatHistoryLoaded,
  loadMoreChatHistory,
  patchChatHistoryItem,
  removeChatHistoryItem,
  setChatHistoryOwner,
  useChatHistorySnapshot,
} from "@/lib/chat-history-store";
import type { MainTabParamList } from "@/navigation/types";
import { radius, spacing } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";

type GroupedHistory = {
  today: ChatHistoryItem[];
  yesterday: ChatHistoryItem[];
  lastWeek: ChatHistoryItem[];
  lastMonth: ChatHistoryItem[];
  older: ChatHistoryItem[];
};

type AppSidebarProps = {
  onClose: () => void;
  visible: boolean;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SIDEBAR_CLOSED_TRANSLATE_X = -336;

export function AppSidebar({ onClose, visible }: AppSidebarProps) {
  const { bootstrap, session } = useAuth();
  const { palette } = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const historySnapshot = useChatHistorySnapshot();
  const sidebarTranslateX = useRef(
    new Animated.Value(SIDEBAR_CLOSED_TRANSLATE_X)
  ).current;
  const [isMounted, setIsMounted] = useState(visible);
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
  const openAnimationFrameRef = useRef<number | null>(null);

  const sidebarBackdropOpacity = sidebarTranslateX.interpolate({
    inputRange: [SIDEBAR_CLOSED_TRANSLATE_X, 0],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  useEffect(() => {
    setChatHistoryOwner(session?.user.id ?? null);
  }, [session?.user.id]);

  useEffect(() => {
    sidebarTranslateX.stopAnimation();
    if (openAnimationFrameRef.current !== null) {
      cancelAnimationFrame(openAnimationFrameRef.current);
      openAnimationFrameRef.current = null;
    }

    if (!visible) {
      Animated.timing(sidebarTranslateX, {
        toValue: SIDEBAR_CLOSED_TRANSLATE_X,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setIsMounted(false);
          setActiveHistoryMenuId(null);
        }
      });
      return;
    }

    setIsMounted(true);
    ensureChatHistoryLoaded().catch(() => undefined);
    sidebarTranslateX.setValue(SIDEBAR_CLOSED_TRANSLATE_X);
    openAnimationFrameRef.current = requestAnimationFrame(() => {
      openAnimationFrameRef.current = null;
      Animated.timing(sidebarTranslateX, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  }, [sidebarTranslateX, visible]);

  useEffect(
    () => () => {
      if (openAnimationFrameRef.current !== null) {
        cancelAnimationFrame(openAnimationFrameRef.current);
      }
      sidebarTranslateX.stopAnimation();
    },
    [sidebarTranslateX]
  );

  const loadMoreHistory = useCallback(async () => {
    await loadMoreChatHistory();
  }, []);

  const groupedHistory = useMemo(
    () => groupHistoryByDate(historySnapshot.chats),
    [historySnapshot.chats]
  );
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

  const openChatFromSidebar = useCallback(
    (chatId?: string) => {
      onClose();
      navigation.navigate("Chat", chatId ? { chatId } : undefined);
    },
    [navigation, onClose]
  );

  const openJobsFromSidebar = useCallback(
    (chatId?: string) => {
      onClose();
      navigation.navigate(
        "Jobs",
        chatId
          ? {
              chatId,
              openAsk: true,
            }
          : undefined
      );
    },
    [navigation, onClose]
  );

  const openHistoryItem = useCallback(
    (item: ChatHistoryItem) => {
      setActiveHistoryMenuId(null);
      if (item.mode === "jobs") {
        openJobsFromSidebar(item.id);
        return;
      }
      openChatFromSidebar(item.id);
    },
    [openChatFromSidebar, openJobsFromSidebar]
  );

  const startNewChat = useCallback(() => {
    setActiveHistoryMenuId(null);
    onClose();
    navigation.navigate("Chat", { newChat: true });
  }, [navigation, onClose]);

  const shareChat = useCallback(
    async (item: ChatHistoryItem, visibility: "private" | "public") => {
      if (visibilityUpdatingChatId) {
        return;
      }
      setVisibilityUpdatingChatId(item.id);
      setHistoryActionStatus(null);
      try {
        await api.updateChatVisibility(item.id, visibility);
        patchChatHistoryItem(item.id, { visibility });
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
    setIsDeletingChat(true);
    setDeleteHistoryItem(null);
    setActiveHistoryMenuId(null);
    removeChatHistoryItem(itemToDelete.id);
    setHistoryActionStatus(null);
    try {
      await api.deleteChat(itemToDelete.id);
      setHistoryActionStatus("Chat deleted.");
    } catch (error) {
      ensureChatHistoryLoaded({ force: true }).catch(() => undefined);
      setHistoryActionStatus(
        error instanceof Error ? error.message : "Unable to delete chat."
      );
    } finally {
      setIsDeletingChat(false);
    }
  }, [deleteHistoryItem, isDeletingChat]);

  const renderHistoryItem = (item: ChatHistoryItem, keyPrefix: string) => {
    const isMenuOpen = activeHistoryMenuId === item.id;
    const visibility = item.visibility ?? "private";
    const isVisibilityUpdating = visibilityUpdatingChatId === item.id;

    return (
      <View
        key={`${keyPrefix}-${item.id}`}
        style={[
          styles.sidebarHistoryItemWrap,
          isMenuOpen ? styles.sidebarHistoryItemActive : null,
        ]}
      >
        <View style={styles.sidebarHistoryRow}>
          <Pressable
            onPress={() => openHistoryItem(item)}
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
              style={[
                styles.sidebarHistoryText,
                { color: palette.mutedForeground },
              ]}
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
              <Text
                style={[styles.historyActionText, { color: palette.foreground }]}
              >
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
            <View
              style={[
                styles.historyActionSeparator,
                { backgroundColor: palette.border },
              ]}
            />
            <Pressable
              onPress={() => {
                setDeleteHistoryItem(item);
                setActiveHistoryMenuId(null);
              }}
              style={styles.historyActionDanger}
            >
              <Trash2 color={palette.destructive} size={15} />
              <Text
                style={[
                  styles.historyActionText,
                  { color: palette.destructive },
                ]}
              >
                Delete
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <>
      <View
        pointerEvents={isMounted ? "auto" : "none"}
        style={styles.sidebarOverlay}
      >
        <Pressable onPress={onClose} style={styles.sidebarBackdrop}>
          <Animated.View
            style={[
              styles.sidebarBackdropFill,
              { opacity: sidebarBackdropOpacity },
            ]}
          />
        </Pressable>
        <Animated.View
          style={[
            styles.sidebarPanel,
            {
              backgroundColor: palette.background,
              transform: [{ translateX: sidebarTranslateX }],
            },
          ]}
        >
          <ScrollView
            contentContainerStyle={[
              styles.sidebarHistoryContent,
              { paddingBottom: insets.bottom + 32 },
            ]}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled={true}
            onScroll={({ nativeEvent }) => {
              const { contentOffset, contentSize, layoutMeasurement } =
                nativeEvent;
              const remaining =
                contentSize.height -
                (contentOffset.y + layoutMeasurement.height);
              if (remaining < 120) {
                loadMoreHistory().catch(() => undefined);
              }
            }}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
          >
              <View style={styles.sidebarBrandRow}>
                <RNImage
                  resizeMode="contain"
                  source={require("../../assets/khasigptlogo.png")}
                  style={styles.sidebarLogo}
                />
                <Text
                  style={[styles.sidebarBrandText, { color: palette.foreground }]}
                >
                  KhasiGPT
                </Text>
              </View>

              <View style={styles.sidebarFeatureList}>
                <Pressable onPress={startNewChat} style={styles.sidebarFeatureRow}>
                  <Plus color={palette.mutedForeground} size={18} />
                  <Text
                    style={[
                      styles.sidebarFeatureText,
                      { color: palette.mutedForeground },
                    ]}
                  >
                    New chat
                  </Text>
                </Pressable>
                {bootstrap?.featureAccess.study ? (
                  <Pressable
                    onPress={() => {
                      onClose();
                      navigation.navigate("Study");
                    }}
                    style={styles.sidebarFeatureRow}
                  >
                    <BookOpen color={palette.mutedForeground} size={16} />
                    <Text
                      style={[
                        styles.sidebarFeatureText,
                        { color: palette.mutedForeground },
                      ]}
                    >
                      Study Mode
                    </Text>
                  </Pressable>
                ) : null}
                {bootstrap?.featureAccess.jobs ? (
                  <Pressable
                    onPress={() => openJobsFromSidebar()}
                    style={styles.sidebarFeatureRow}
                  >
                    <BriefcaseBusiness
                      color={palette.mutedForeground}
                      size={16}
                    />
                    <Text
                      style={[
                        styles.sidebarFeatureText,
                        { color: palette.mutedForeground },
                      ]}
                    >
                      Jobs
                    </Text>
                  </Pressable>
                ) : null}
                {bootstrap?.featureAccess.calculator ? (
                  <Pressable
                    onPress={() => {
                      onClose();
                      navigation.navigate("Calculator");
                    }}
                    style={styles.sidebarFeatureRow}
                  >
                    <Calculator color={palette.mutedForeground} size={16} />
                    <Text
                      style={[
                        styles.sidebarFeatureText,
                        { color: palette.mutedForeground },
                      ]}
                    >
                      Calculator
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <View
                style={[styles.sidebarSeparator, { backgroundColor: palette.border }]}
              />

              <Text style={styles.sidebarSectionTitle}>Chat History</Text>
              {historySections.map((section, index) => (
                <View
                  key={section.key}
                  style={index > 0 ? styles.sidebarHistorySection : null}
                >
                  <Text style={styles.sidebarDateTitle}>{section.title}</Text>
                  {section.items.map((item) =>
                    renderHistoryItem(item, section.key)
                  )}
                </View>
              ))}
              {historyActionStatus ? (
                <Text
                  style={[
                    styles.sidebarActionStatus,
                    { color: palette.mutedForeground },
                  ]}
                >
                  {historyActionStatus}
                </Text>
              ) : null}
              {historySnapshot.isLoading &&
              !historySnapshot.hasLoaded &&
              historySnapshot.chats.length === 0 ? (
                <Text
                  style={[
                    styles.sidebarLoadingText,
                    {
                      color: palette.mutedForeground,
                      marginBottom: insets.bottom + 8,
                    },
                  ]}
                >
                  Loading...
                </Text>
              ) : null}
              {historySnapshot.isLoadingMore ? (
                <Text
                  style={[
                    styles.sidebarLoadingText,
                    {
                      color: palette.mutedForeground,
                      marginBottom: insets.bottom + 8,
                    },
                  ]}
                >
                  Loading more...
                </Text>
              ) : null}
          </ScrollView>
        </Animated.View>
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => {
          if (!isDeletingChat) {
            setDeleteHistoryItem(null);
          }
        }}
        transparent
        visible={Boolean(deleteHistoryItem)}
      >
        <View style={styles.confirmOverlay}>
          <View
            style={[styles.confirmDialog, { backgroundColor: palette.background }]}
          >
            <Text style={[styles.confirmTitle, { color: palette.foreground }]}>
              Are you absolutely sure?
            </Text>
            <Text
              style={[
                styles.confirmDescription,
                { color: palette.mutedForeground },
              ]}
            >
              This will remove the chat from your history. The record is kept
              safely in the backend unless an administrator purges it.
            </Text>
            <Pressable
              disabled={isDeletingChat}
              onPress={confirmDeleteChat}
              style={[
                styles.confirmPrimaryButton,
                { backgroundColor: palette.primary },
                isDeletingChat ? styles.disabledButton : null,
              ]}
            >
              {isDeletingChat ? (
                <ActivityIndicator color={palette.primaryForeground} size="small" />
              ) : (
                <Text
                  style={[
                    styles.confirmPrimaryText,
                    { color: palette.primaryForeground },
                  ]}
                >
                  Continue
                </Text>
              )}
            </Pressable>
            <Pressable
              disabled={isDeletingChat}
              onPress={() => setDeleteHistoryItem(null)}
              style={[
                styles.confirmSecondaryButton,
                { borderColor: palette.border },
              ]}
            >
              <Text
                style={[
                  styles.confirmSecondaryText,
                  { color: palette.foreground },
                ]}
              >
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
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

const styles = StyleSheet.create({
  sidebarOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    elevation: 50,
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
    flex: 1,
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
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmSecondaryText: {
    fontSize: 16,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.7,
  },
});
