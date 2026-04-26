import { useFocusEffect } from "@react-navigation/native";
import {
  Bell,
  BellOff,
  Bookmark,
  ChevronDown,
  Clock,
  Eye,
  Filter,
  Heart,
  Lightbulb,
  MessageSquare,
  MoreVertical,
  Plus,
  Search,
  ThumbsUp,
  X,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image as RNImage,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { api } from "@/api/client";
import type {
  ForumCategory,
  ForumOverview,
  ForumPost,
  ForumReactionType,
  ForumTag,
  ForumThread,
  ForumThreadDetail,
} from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/Button";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import { radius, spacing, typography } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";
import { DEFAULT_AVATAR_BACKGROUND } from "@/utils/avatar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Filters = {
  category: string | null;
  search: string;
  tag: string | null;
};

type ForumFilterDropdown = "category" | "tag" | null;

const EMPTY_FILTERS: Filters = {
  category: null,
  search: "",
  tag: null,
};

const REACTIONS: Array<{
  label: string;
  type: ForumReactionType;
}> = [
  { label: "Helpful", type: "like" },
  { label: "Insightful", type: "insightful" },
  { label: "Support", type: "support" },
];

function initials(name: string | null | undefined) {
  const base = (name ?? "F").trim() || "F";
  return (
    base
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "F"
  );
}

function sanitizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function formatRelative(value: string | null | undefined) {
  if (!value) {
    return "just now";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "just now";
  }
  const diffMs = date.getTime() - Date.now();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const abs = Math.abs(diffMs);
  const formatUnit = (amount: number, unit: string) => {
    if (amount === 0) {
      return "just now";
    }
    const suffix = amount < 0 ? "ago" : "from now";
    const absoluteAmount = Math.abs(amount);
    return `${absoluteAmount} ${unit}${absoluteAmount === 1 ? "" : "s"} ${suffix}`;
  };
  if (abs < hour) {
    return formatUnit(Math.round(diffMs / minute), "minute");
  }
  if (abs < day) {
    return formatUnit(Math.round(diffMs / hour), "hour");
  }
  return formatUnit(Math.round(diffMs / day), "day");
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not available";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const day = String(date.getDate()).padStart(2, "0");
  const month = months[date.getMonth()] ?? "";
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${day} ${month} ${year}, ${hours}:${minutes} ${suffix}`;
}

function getReactionIcon(type: ForumReactionType, color: string) {
  const props = { color, size: 14, strokeWidth: 1.8 };
  if (type === "insightful") {
    return <Lightbulb {...props} />;
  }
  if (type === "support") {
    return <Heart {...props} />;
  }
  return <ThumbsUp {...props} />;
}

function ForumAvatar({
  avatarUrl,
  name,
  size = 32,
}: {
  avatarUrl?: string | null;
  name?: string | null;
  size?: number;
}) {
  const textSize = size <= 32 ? 12 : 14;
  if (avatarUrl) {
    return (
      <RNImage
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  return (
    <View
      style={[
        styles.avatarFallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: DEFAULT_AVATAR_BACKGROUND,
        },
      ]}
    >
      <Text style={[styles.avatarFallbackText, { fontSize: textSize }]}>
        {initials(name)}
      </Text>
    </View>
  );
}

export function ForumScreen() {
  const { palette } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { bootstrap, session } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [overview, setOverview] = useState<ForumOverview | null>(null);
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchDraft, setSearchDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [detailSlug, setDetailSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<ForumThreadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [threadTitle, setThreadTitle] = useState("");
  const [threadContent, setThreadContent] = useState("");
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string | null>(
    null
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [filterDropdown, setFilterDropdown] = useState<ForumFilterDropdown>(null);

  const dictionary = bootstrap?.i18n.dictionary ?? {};
  const t = useCallback(
    (key: string, fallback: string) => dictionary[key] ?? fallback,
    [dictionary]
  );
  const viewerId = session?.user.id ?? null;
  const viewerName =
    [session?.user.firstName, session?.user.lastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" ") ||
    session?.user.name ||
    session?.user.email ||
    null;
  const viewerIsAdmin = session?.user.role === "admin";

  const loadOverview = useCallback(
    async (nextFilters = filters, mode: "replace" | "append" = "replace") => {
      if (mode === "replace") {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      try {
        const data = await api.forumThreads({
          category: nextFilters.category,
          cursor: mode === "append" ? overview?.nextCursor : null,
          limit: 15,
          search: nextFilters.search.trim() || null,
          tag: nextFilters.tag,
        });
        setOverview(data);
        setThreads((current) =>
          mode === "append"
            ? [
                ...current,
                ...data.threads.filter(
                  (thread) => !current.some((item) => item.id === thread.id)
                ),
              ]
            : data.threads
        );
        if (mode === "replace") {
          const firstUnlocked = data.categories.find(
            (category) => !category.isLocked
          );
          setSelectedCategorySlug((current) => current ?? firstUnlocked?.slug ?? null);
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load forum."
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters, overview?.nextCursor]
  );

  useFocusEffect(
    useCallback(() => {
      void loadOverview(EMPTY_FILTERS, "replace");
    }, [loadOverview])
  );

  const openThread = useCallback(async (thread: ForumThread) => {
    setDetailSlug(thread.slug);
    setDetail(null);
    setDetailLoading(true);
    setReplyText("");
    try {
      const data = await api.forumThread(thread.slug);
      setDetail(data);
      api.recordForumThreadView(thread.slug).catch(() => undefined);
    } catch (loadError) {
      Alert.alert(
        "Forum",
        loadError instanceof Error
          ? loadError.message
          : "Unable to open this discussion."
      );
      setDetailSlug(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const applyFilters = useCallback(
    (patch: Partial<Filters>) => {
      const next = { ...filters, ...patch };
      setFilters(next);
      setSearchDraft(next.search);
      void loadOverview(next, "replace");
    },
    [filters, loadOverview]
  );

  const resetFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setSearchDraft("");
    void loadOverview(EMPTY_FILTERS, "replace");
  }, [loadOverview]);

  const createThread = useCallback(async () => {
    if (!viewerId) {
      Alert.alert("Sign in required", "You need to be logged in to start a discussion.");
      return;
    }
    const title = threadTitle.trim();
    const content = threadContent.trim();
    if (title.length < 8) {
      Alert.alert("Title too short", "Title must be at least 8 characters long.");
      return;
    }
    if (content.length < 24) {
      Alert.alert("Add more details", "Describe your discussion in more detail.");
      return;
    }
    if (!selectedCategorySlug) {
      Alert.alert("Select category", "Please select a category.");
      return;
    }
    setBusyAction("create-thread");
    try {
      const created = await api.createForumThread({
        title,
        content,
        summary: content.slice(0, 280),
        categorySlug: selectedCategorySlug,
        tagSlugs: selectedTags,
      });
      setComposerOpen(false);
      setThreadTitle("");
      setThreadContent("");
      setSelectedTags([]);
      await loadOverview(filters, "replace");
      const data = await api.forumThread(created.slug);
      setDetail(data);
      setDetailSlug(created.slug);
    } catch (createError) {
      Alert.alert(
        "Unable to publish",
        createError instanceof Error
          ? createError.message
          : "Unable to publish discussion."
      );
    } finally {
      setBusyAction(null);
    }
  }, [
    filters,
    loadOverview,
    selectedCategorySlug,
    selectedTags,
    threadContent,
    threadTitle,
    viewerId,
  ]);

  const postReply = useCallback(async () => {
    if (!detail || !viewerId) {
      Alert.alert("Sign in required", "Sign in to join the conversation.");
      return;
    }
    const content = replyText.trim();
    if (content.length < 8) {
      Alert.alert("Reply too short", "Replies should be at least 8 characters.");
      return;
    }
    setBusyAction("reply");
    try {
      await api.createForumReply(detail.thread.slug, { content });
      const refreshed = await api.forumThread(detail.thread.slug);
      setDetail(refreshed);
      setReplyText("");
      await loadOverview(filters, "replace");
    } catch (replyError) {
      Alert.alert(
        "Unable to post reply",
        replyError instanceof Error ? replyError.message : "Unable to post reply."
      );
    } finally {
      setBusyAction(null);
    }
  }, [detail, filters, loadOverview, replyText, viewerId]);

  const toggleReaction = useCallback(
    async (post: ForumPost, type: ForumReactionType) => {
      if (!detail || !viewerId) {
        Alert.alert("Sign in required", "Sign in to react to posts.");
        return;
      }
      setBusyAction(`${post.id}-${type}`);
      try {
        const result = await api.toggleForumPostReaction(post.id, { type });
        setDetail((current) => {
          if (!current) return current;
          const currentViewerReactions = new Set(
            current.viewerReactions[post.id] ?? []
          );
          if (result.active) {
            currentViewerReactions.add(type);
          } else {
            currentViewerReactions.delete(type);
          }
          return {
            ...current,
            viewerReactions: {
              ...current.viewerReactions,
              [post.id]: Array.from(currentViewerReactions),
            },
            posts: current.posts.map((item) =>
              item.id === post.id
                ? {
                    ...item,
                    reactions: {
                      ...item.reactions,
                      [type]: Math.max(
                        0,
                        (item.reactions[type] ?? 0) + (result.active ? 1 : -1)
                      ),
                    },
                  }
                : item
            ),
          };
        });
      } catch (reactionError) {
        Alert.alert(
          "Unable to react",
          reactionError instanceof Error
            ? reactionError.message
            : "Unable to update reaction."
        );
      } finally {
        setBusyAction(null);
      }
    },
    [detail, viewerId]
  );

  const toggleSubscribe = useCallback(async () => {
    if (!detail || !viewerId) {
      Alert.alert("Sign in required", "Sign in to manage thread notifications.");
      return;
    }
    const subscribe = !detail.isSubscribed;
    setBusyAction("subscribe");
    try {
      const result = await api.toggleForumSubscription(
        detail.thread.slug,
        subscribe
      );
      setDetail((current) =>
        current ? { ...current, isSubscribed: result.subscribed } : current
      );
    } catch (subscribeError) {
      Alert.alert(
        "Unable to update",
        subscribeError instanceof Error
          ? subscribeError.message
          : "Unable to update subscription."
      );
    } finally {
      setBusyAction(null);
    }
  }, [detail, viewerId]);

  const updateThreadStatus = useCallback(
    async (action: "resolve" | "reopen") => {
      if (!detail) return;
      setBusyAction(action);
      try {
        const result = await api.updateForumThreadStatus(detail.thread.slug, action);
        setDetail((current) =>
          current
            ? {
                ...current,
                thread: {
                  ...current.thread,
                  status:
                    result.status === "resolved" || result.status === "open"
                      ? result.status
                      : current.thread.status,
                },
              }
            : current
        );
        await loadOverview(filters, "replace");
      } catch (statusError) {
        Alert.alert(
          "Unable to update",
          statusError instanceof Error
            ? statusError.message
            : "Unable to update thread."
        );
      } finally {
        setBusyAction(null);
      }
    },
    [detail, filters, loadOverview]
  );

  const deleteThread = useCallback(() => {
    if (!detail) return;
    Alert.alert(
      "Delete thread",
      "Are you sure you want to delete this thread? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusyAction("delete");
            try {
              await api.deleteForumThread(detail.thread.slug);
              setDetail(null);
              setDetailSlug(null);
              await loadOverview(filters, "replace");
            } catch (deleteError) {
              Alert.alert(
                "Unable to delete",
                deleteError instanceof Error
                  ? deleteError.message
                  : "Unable to delete thread."
              );
            } finally {
              setBusyAction(null);
            }
          },
        },
      ]
    );
  }, [detail, filters, loadOverview]);

  const totalThreads =
    overview?.categories.reduce(
      (total, category) => total + (category.threadCount ?? 0),
      0
    ) ?? threads.length;
  const activeCategory = overview?.categories.find(
    (category) => category.slug === filters.category
  );
  const activeTag = overview?.tags.find((tag) => tag.slug === filters.tag);
  const bottomSafePadding = Math.max(insets.bottom + spacing[8], spacing[10]);

  return (
    <Screen padded={false} scroll={false}>
      <PageHeader
        compact
        leftControl="sidebar"
        onSidebarPress={() => setIsSidebarOpen(true)}
        title="KhasiGPT"
      />
      <FlatList
        ListHeaderComponent={
          <View style={styles.content}>
            <ForumHero
              onCreatePress={() => setComposerOpen(true)}
              totalThreads={totalThreads}
              visibleThreads={threads.length}
            />
            <ForumFilters
              activeCategorySlug={filters.category}
              activeTagSlug={filters.tag}
              categories={overview?.categories ?? []}
              onCategoryPress={(category) =>
                applyFilters({ category: category?.slug ?? null })
              }
              onReset={resetFilters}
              onSearch={() => applyFilters({ search: searchDraft.trim() })}
              onTagPress={(tag) => applyFilters({ tag: tag?.slug ?? null })}
              searchDraft={searchDraft}
              setFilterDropdown={setFilterDropdown}
              setSearchDraft={setSearchDraft}
              showCategoryDropdown={filterDropdown === "category"}
              showTagDropdown={filterDropdown === "tag"}
              tags={overview?.tags ?? []}
            />
            {activeCategory || activeTag || filters.search ? (
              <View
                style={[
                  styles.activeFilter,
                  { borderColor: palette.border, backgroundColor: palette.muted },
                ]}
              >
                <Filter color={palette.mutedForeground} size={14} />
                <Text
                  style={[styles.activeFilterText, { color: palette.foreground }]}
                >
                  {[
                    activeCategory ? `Category: ${activeCategory.name}` : null,
                    activeTag ? `Tag: #${activeTag.label}` : null,
                    filters.search ? `Search: "${filters.search}"` : null,
                  ]
                    .filter(Boolean)
                    .join("  ")}
                </Text>
              </View>
            ) : null}
            {loading ? <ForumSkeleton /> : null}
            {error ? (
              <View
                style={[
                  styles.emptyCard,
                  { borderColor: palette.border, backgroundColor: palette.card },
                ]}
              >
                <Text style={[styles.emptyTitle, { color: palette.foreground }]}>
                  Unable to load forum
                </Text>
                <Text style={[styles.emptyText, { color: palette.mutedForeground }]}>
                  {error}
                </Text>
                <Button onPress={() => loadOverview(filters, "replace")}>
                  Try again
                </Button>
              </View>
            ) : null}
            {!loading && !error && threads.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  { borderColor: palette.border, backgroundColor: palette.card },
                ]}
              >
                <Text style={[styles.emptyTitle, { color: palette.foreground }]}>
                  {t("forum.empty.title", "No discussions yet")}
                </Text>
                <Text style={[styles.emptyText, { color: palette.mutedForeground }]}>
                  {t(
                    "forum.empty.subtitle",
                    "Be the first to start a topic in this category."
                  )}
                </Text>
              </View>
            ) : null}
          </View>
        }
        ListFooterComponent={
          overview?.hasMore && !loading ? (
            <View
              style={[
                styles.loadMoreWrap,
                { paddingBottom: bottomSafePadding },
              ]}
            >
              <Button
                loading={loadingMore}
                loadingText="Loading..."
                onPress={() => loadOverview(filters, "append")}
                variant="outline"
              >
                Load more discussions
              </Button>
            </View>
          ) : (
            <View style={{ height: bottomSafePadding }} />
          )
        }
        contentContainerStyle={styles.listContent}
        data={loading ? [] : threads}
        keyExtractor={(thread) => thread.id}
        renderItem={({ item }) => (
          <ThreadCard
            isSubscribed={Boolean(overview?.subscribedThreadIds.includes(item.id))}
            onPress={() => openThread(item)}
            thread={item}
          />
        )}
      />
      <ComposerModal
        busy={busyAction === "create-thread"}
        categories={overview?.categories ?? []}
        content={threadContent}
        onClose={() => setComposerOpen(false)}
        onContentChange={setThreadContent}
        onCreate={createThread}
        onSelectCategory={setSelectedCategorySlug}
        onToggleTag={(slug) =>
          setSelectedTags((current) =>
            current.includes(slug)
              ? current.filter((tag) => tag !== slug)
              : current.length >= 5
                ? current
                : [...current, slug]
          )
        }
        open={composerOpen}
        selectedCategorySlug={selectedCategorySlug}
        selectedTags={selectedTags}
        tags={overview?.tags ?? []}
        title={threadTitle}
        viewerId={viewerId}
        viewerName={viewerName}
        onTitleChange={setThreadTitle}
        bottomSafePadding={bottomSafePadding}
      />
      <ThreadDetailModal
        bottomSafePadding={bottomSafePadding}
        busyAction={busyAction}
        detail={detail}
        loading={detailLoading}
        onClose={() => {
          setDetailSlug(null);
          setDetail(null);
        }}
        onDelete={deleteThread}
        onPostReply={postReply}
        onReaction={toggleReaction}
        onStatusChange={updateThreadStatus}
        onSubscribe={toggleSubscribe}
        open={Boolean(detailSlug)}
        replyText={replyText}
        setReplyText={setReplyText}
        viewerId={viewerId}
        viewerIsAdmin={viewerIsAdmin}
      />
      <AppSidebar onClose={() => setIsSidebarOpen(false)} visible={isSidebarOpen} />
    </Screen>
  );
}

function ForumHero({
  onCreatePress,
  totalThreads,
  visibleThreads,
}: {
  onCreatePress: () => void;
  totalThreads: number;
  visibleThreads: number;
}) {
  const { palette } = useAppTheme();
  return (
    <View
      style={[
        styles.hero,
        { borderColor: palette.border, backgroundColor: palette.card },
      ]}
    >
      <Text style={[styles.eyebrow, { color: palette.primary }]}>
        Community Forum
      </Text>
      <Text style={[styles.heroTitle, { color: palette.foreground }]}>
        Discuss issues, bugs, suggest features, etc.
      </Text>
      <View style={styles.heroBottom}>
        <View style={styles.statRow}>
          <View>
            <Text style={[styles.statValue, { color: palette.foreground }]}>
              {totalThreads}
            </Text>
            <Text style={[styles.statLabel, { color: palette.mutedForeground }]}>
              Total topics
            </Text>
          </View>
          <View>
            <Text style={[styles.statValue, { color: palette.foreground }]}>
              {visibleThreads}
            </Text>
            <Text style={[styles.statLabel, { color: palette.mutedForeground }]}>
              Visible now
            </Text>
          </View>
        </View>
        <Button onPress={onCreatePress} style={styles.startButton}>
          <Plus color={palette.primaryForeground} size={17} />
          <Text style={[styles.startButtonText, { color: palette.primaryForeground }]}>
            Start a discussion
          </Text>
        </Button>
      </View>
    </View>
  );
}

function ForumFilters({
  activeCategorySlug,
  activeTagSlug,
  categories,
  onCategoryPress,
  onReset,
  onSearch,
  onTagPress,
  searchDraft,
  setFilterDropdown,
  setSearchDraft,
  showCategoryDropdown,
  showTagDropdown,
  tags,
}: {
  activeCategorySlug: string | null;
  activeTagSlug: string | null;
  categories: ForumCategory[];
  onCategoryPress: (category: ForumCategory | null) => void;
  onReset: () => void;
  onSearch: () => void;
  onTagPress: (tag: ForumTag | null) => void;
  searchDraft: string;
  setFilterDropdown: (value: ForumFilterDropdown) => void;
  setSearchDraft: (value: string) => void;
  showCategoryDropdown: boolean;
  showTagDropdown: boolean;
  tags: ForumTag[];
}) {
  const { palette } = useAppTheme();
  const total = categories.reduce(
    (count, category) => count + (category.threadCount ?? 0),
    0
  );
  const activeCategory = categories.find(
    (category) => category.slug === activeCategorySlug
  );
  const activeTag = tags.find((tag) => tag.slug === activeTagSlug);
  return (
    <View
      style={[
        styles.filterCard,
        { borderColor: palette.border, backgroundColor: palette.card },
      ]}
    >
      <View
        style={[
          styles.searchInputWrap,
          { borderColor: palette.input, backgroundColor: palette.background },
        ]}
      >
        <Search color={palette.mutedForeground} size={17} />
        <TextInput
          onChangeText={setSearchDraft}
          onSubmitEditing={onSearch}
          placeholder="Search discussions, tags, or keywords"
          placeholderTextColor={palette.mutedForeground}
          returnKeyType="search"
          style={[styles.searchInput, { color: palette.foreground }]}
          value={searchDraft}
        />
      </View>
      <View style={styles.filterRow}>
        <Pressable
          onPress={() =>
            setFilterDropdown(showCategoryDropdown ? null : "category")
          }
          style={[
            styles.filterChip,
            { borderColor: palette.border, backgroundColor: palette.background },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[styles.filterChipText, { color: palette.foreground }]}
          >
            {activeCategory?.name ?? "All discussions"}
          </Text>
          <ChevronDown color={palette.mutedForeground} size={14} />
        </Pressable>
        <Pressable
          onPress={() => setFilterDropdown(showTagDropdown ? null : "tag")}
          style={[
            styles.filterChip,
            { borderColor: palette.border, backgroundColor: palette.background },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[styles.filterChipText, { color: palette.foreground }]}
          >
            {activeTag ? `#${activeTag.label}` : "All tags"}
          </Text>
          <ChevronDown color={palette.mutedForeground} size={14} />
        </Pressable>
        <Pressable
          onPress={onReset}
          style={[
            styles.filterChip,
            { borderColor: palette.border, backgroundColor: palette.background },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[styles.filterChipText, { color: palette.foreground }]}
          >
            Reset
          </Text>
        </Pressable>
      </View>
      {showCategoryDropdown ? (
        <View
          style={[
            styles.inlineDropdown,
            { borderColor: palette.border, backgroundColor: palette.background },
          ]}
        >
          <Pressable
            onPress={() => {
              onCategoryPress(null);
              setFilterDropdown(null);
            }}
            style={[
              styles.categoryRow,
              !activeCategorySlug
                ? { backgroundColor: palette.muted }
                : null,
            ]}
          >
            <Text style={[styles.categoryText, { color: palette.foreground }]}>
              All discussions
            </Text>
            <Text style={[styles.categoryCount, { color: palette.mutedForeground }]}>
              {total}
            </Text>
          </Pressable>
          {categories.map((category) => (
            <Pressable
              key={category.id}
              onPress={() => {
                onCategoryPress(category);
                setFilterDropdown(null);
              }}
              style={[
                styles.categoryRow,
                activeCategorySlug === category.slug
                  ? { backgroundColor: palette.muted }
                  : null,
              ]}
            >
              <Text style={[styles.categoryText, { color: palette.foreground }]}>
                {category.name}
              </Text>
              <Text style={[styles.categoryCount, { color: palette.mutedForeground }]}>
                {category.threadCount ?? 0}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {showTagDropdown ? (
        <View
          style={[
            styles.inlineDropdown,
            { borderColor: palette.border, backgroundColor: palette.background },
          ]}
        >
          <Pressable
            onPress={() => {
              onTagPress(null);
              setFilterDropdown(null);
            }}
            style={[
              styles.categoryRow,
              !activeTagSlug ? { backgroundColor: palette.muted } : null,
            ]}
          >
            <Text style={[styles.categoryText, { color: palette.foreground }]}>
              All tags
            </Text>
          </Pressable>
          {tags.slice(0, 12).map((tag) => (
            <Pressable
              key={tag.id}
              onPress={() => {
                onTagPress(tag);
                setFilterDropdown(null);
              }}
              style={[
                styles.categoryRow,
                activeTagSlug === tag.slug ? { backgroundColor: palette.muted } : null,
              ]}
            >
              <Text style={[styles.categoryText, { color: palette.foreground }]}>
                #{tag.label}
              </Text>
              <Text style={[styles.categoryCount, { color: palette.mutedForeground }]}>
                {tag.usageCount ?? 0}
              </Text>
            </Pressable>
          ))}
          {tags.length === 0 ? (
            <Text style={[styles.dropdownEmpty, { color: palette.mutedForeground }]}>
              No tags available yet.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ThreadCard({
  isSubscribed,
  onPress,
  thread,
}: {
  isSubscribed: boolean;
  onPress: () => void;
  thread: ForumThread;
}) {
  const { palette } = useAppTheme();
  const excerpt = sanitizeText(thread.excerpt);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.threadCard,
        {
          borderColor: palette.border,
          backgroundColor: palette.card,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <View style={styles.badgeRow}>
        <Badge label={thread.category.name} tone="primary" />
        {thread.isPinned ? <Badge label="Pinned" tone="warning" /> : null}
        {thread.status === "resolved" ? <Badge label="Resolved" tone="success" /> : null}
        {thread.isLocked ? <Badge label="Locked" tone="danger" /> : null}
        {isSubscribed ? (
          <View
            style={[
              styles.badge,
              { borderColor: "#0ea5e955", backgroundColor: "#0ea5e91a" },
            ]}
          >
            <Bookmark color="#0284c7" size={12} />
            <Text style={[styles.badgeText, { color: "#0284c7" }]}>
              Subscribed
            </Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.threadTitle, { color: palette.foreground }]}>
        {thread.title}
      </Text>
      <Text
        numberOfLines={3}
        style={[styles.threadExcerpt, { color: palette.mutedForeground }]}
      >
        {excerpt || "This discussion does not include a preview yet."}
      </Text>
      {thread.tags.length > 0 ? (
        <View style={styles.tagWrap}>
          {thread.tags.map((tag) => (
            <View
              key={tag.id}
              style={[styles.threadTag, { borderColor: palette.border }]}
            >
              <Text style={[styles.threadTagText, { color: palette.mutedForeground }]}>
                #{tag.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.metaRow}>
        <MetaIcon
          icon={<MessageSquare color={palette.mutedForeground} size={14} />}
          label={`${thread.totalReplies ?? 0} replies`}
        />
        <MetaIcon
          icon={<Eye color={palette.mutedForeground} size={14} />}
          label={`${thread.viewCount ?? 0} views`}
        />
        <MetaIcon
          icon={<Clock color={palette.mutedForeground} size={14} />}
          label={formatRelative(thread.lastRepliedAt ?? thread.updatedAt)}
        />
      </View>
    </Pressable>
  );
}

function Badge({ label, tone }: { label: string; tone: "primary" | "warning" | "success" | "danger" }) {
  const colors =
    tone === "primary"
      ? { border: "#18181b55", background: "#18181b0f", text: "#18181b" }
      : tone === "warning"
        ? { border: "#f59e0b66", background: "#f59e0b1a", text: "#b45309" }
        : tone === "success"
          ? { border: "#10b98155", background: "#10b9811a", text: "#059669" }
          : { border: "#ef444455", background: "#ef44441a", text: "#dc2626" };
  return (
    <View
      style={[
        styles.badge,
        { borderColor: colors.border, backgroundColor: colors.background },
      ]}
    >
      <Text style={[styles.badgeText, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

function MetaIcon({ icon, label }: { icon: React.ReactNode; label: string }) {
  const { palette } = useAppTheme();
  return (
    <View style={styles.metaItem}>
      {icon}
      <Text style={[styles.metaText, { color: palette.mutedForeground }]}>
        {label}
      </Text>
    </View>
  );
}

function ComposerModal({
  bottomSafePadding,
  busy,
  categories,
  content,
  onClose,
  onContentChange,
  onCreate,
  onSelectCategory,
  onTitleChange,
  onToggleTag,
  open,
  selectedCategorySlug,
  selectedTags,
  tags,
  title,
  viewerId,
  viewerName,
}: {
  bottomSafePadding: number;
  busy: boolean;
  categories: ForumCategory[];
  content: string;
  onClose: () => void;
  onContentChange: (value: string) => void;
  onCreate: () => void;
  onSelectCategory: (value: string) => void;
  onTitleChange: (value: string) => void;
  onToggleTag: (value: string) => void;
  open: boolean;
  selectedCategorySlug: string | null;
  selectedTags: string[];
  tags: ForumTag[];
  title: string;
  viewerId: string | null;
  viewerName: string | null;
}) {
  const { palette } = useAppTheme();
  const availableCategories = categories.filter((category) => !category.isLocked);
  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={open}>
      <Screen padded={false} scroll={false}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: palette.foreground }]}>
            {viewerName
              ? `Hi ${viewerName.split(" ")[0]}, share an update`
              : "Start a discussion"}
          </Text>
          <Pressable onPress={onClose} style={styles.iconButton}>
            <X color={palette.foreground} size={22} />
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={[
            styles.modalContent,
            { paddingBottom: bottomSafePadding },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {!viewerId ? (
            <View
              style={[
                styles.emptyCard,
                { borderColor: palette.border, backgroundColor: palette.card },
              ]}
            >
              <Text style={[styles.emptyTitle, { color: palette.foreground }]}>
                Sign in to continue
              </Text>
              <Text style={[styles.emptyText, { color: palette.mutedForeground }]}>
                You need to be logged in to start a discussion.
              </Text>
            </View>
          ) : null}
          <Field
            label="Title"
            onChangeText={onTitleChange}
            placeholder="What would you like to discuss?"
            value={title}
          />
          <Text style={[styles.fieldLabel, { color: palette.mutedForeground }]}>
            Category
          </Text>
          <View style={styles.tagWrap}>
            {availableCategories.map((category) => {
              const active = selectedCategorySlug === category.slug;
              return (
                <Pressable
                  key={category.id}
                  onPress={() => onSelectCategory(category.slug)}
                  style={[
                    styles.selectPill,
                    {
                      borderColor: active ? palette.primary : palette.border,
                      backgroundColor: active ? palette.muted : "transparent",
                    },
                  ]}
                >
                  <Text style={[styles.selectPillText, { color: palette.foreground }]}>
                    {category.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Field
            label="Details"
            multiline
            onChangeText={onContentChange}
            placeholder="Share the full context, code snippets, or anything that helps the community respond faster."
            style={styles.detailsInput}
            value={content}
          />
          <View style={styles.sideCardHeader}>
            <Text style={[styles.fieldLabel, { color: palette.mutedForeground }]}>
              Tags
            </Text>
            <Text style={[styles.categoryCount, { color: palette.mutedForeground }]}>
              {selectedTags.length}/5 selected
            </Text>
          </View>
          <View style={styles.tagWrap}>
            {tags.slice(0, 12).map((tag) => {
              const active = selectedTags.includes(tag.slug);
              return (
                <Pressable
                  key={tag.id}
                  onPress={() => onToggleTag(tag.slug)}
                  style={[
                    styles.selectPill,
                    {
                      borderColor: active ? palette.primary : palette.border,
                      backgroundColor: active ? palette.muted : "transparent",
                    },
                  ]}
                >
                  <Text style={[styles.selectPillText, { color: palette.foreground }]}>
                    #{tag.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Button
            disabled={!viewerId}
            loading={busy}
            loadingText="Publishing..."
            onPress={onCreate}
            style={styles.fullButton}
          >
            Publish discussion
          </Button>
        </ScrollView>
      </Screen>
    </Modal>
  );
}

function ThreadDetailModal({
  bottomSafePadding,
  busyAction,
  detail,
  loading,
  onClose,
  onDelete,
  onPostReply,
  onReaction,
  onStatusChange,
  onSubscribe,
  open,
  replyText,
  setReplyText,
  viewerId,
  viewerIsAdmin,
}: {
  bottomSafePadding: number;
  busyAction: string | null;
  detail: ForumThreadDetail | null;
  loading: boolean;
  onClose: () => void;
  onDelete: () => void;
  onPostReply: () => void;
  onReaction: (post: ForumPost, type: ForumReactionType) => void;
  onStatusChange: (action: "resolve" | "reopen") => void;
  onSubscribe: () => void;
  open: boolean;
  replyText: string;
  setReplyText: (value: string) => void;
  viewerId: string | null;
  viewerIsAdmin: boolean;
}) {
  const { palette } = useAppTheme();
  const thread = detail?.thread ?? null;
  const initialPost = detail?.posts[0] ?? null;
  const replies = detail?.posts.slice(1) ?? [];
  const canManageThread =
    Boolean(thread && viewerId && thread.author.id === viewerId) || viewerIsAdmin;

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={open}>
      <Screen padded={false} scroll={false}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} style={styles.backLink}>
            <X color={palette.foreground} size={22} />
            <Text style={[styles.backLinkText, { color: palette.foreground }]}>
              Back to forum
            </Text>
          </Pressable>
          {thread && canManageThread ? (
            <Pressable
              onPress={() => {
                Alert.alert("Thread actions", "Choose an action", [
                  {
                    text:
                      thread.status === "resolved"
                        ? "Reopen discussion"
                        : "Mark as solved",
                    onPress: () =>
                      onStatusChange(
                        thread.status === "resolved" ? "reopen" : "resolve"
                      ),
                  },
                  { text: "Delete thread", style: "destructive", onPress: onDelete },
                  { text: "Cancel", style: "cancel" },
                ]);
              }}
              style={styles.iconButton}
            >
              {busyAction === "resolve" ||
              busyAction === "reopen" ||
              busyAction === "delete" ? (
                <ActivityIndicator color={palette.foreground} size="small" />
              ) : (
                <MoreVertical color={palette.foreground} size={22} />
              )}
            </Pressable>
          ) : null}
        </View>
        {loading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={palette.foreground} size="large" />
          </View>
        ) : detail && thread ? (
          <ScrollView
            contentContainerStyle={[
              styles.modalContent,
              { paddingBottom: bottomSafePadding },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View
              style={[
                styles.detailHero,
                { borderColor: palette.border, backgroundColor: palette.card },
              ]}
            >
              <View style={styles.authorRow}>
                <ForumAvatar
                  avatarUrl={thread.author.avatarUrl}
                  name={thread.author.displayName}
                />
                <View style={styles.authorTextBlock}>
                  <Text style={[styles.authorName, { color: palette.foreground }]}>
                    {thread.author.displayName}
                    {thread.author.isAdmin ? "  Official" : ""}
                  </Text>
                  <Text style={[styles.smallMuted, { color: palette.mutedForeground }]}>
                    Started {formatDateTime(thread.createdAt)}
                  </Text>
                </View>
                <Badge label={thread.category.name} tone="primary" />
              </View>
              <Text style={[styles.detailTitle, { color: palette.foreground }]}>
                {thread.title}
              </Text>
              <View style={styles.tagWrap}>
                {thread.tags.map((tag) => (
                  <View
                    key={tag.id}
                    style={[styles.threadTag, { borderColor: palette.border }]}
                  >
                    <Text
                      style={[styles.threadTagText, { color: palette.mutedForeground }]}
                    >
                      #{tag.label}
                    </Text>
                  </View>
                ))}
              </View>
              {initialPost ? (
                <PostContent post={initialPost} />
              ) : (
                <Text style={[styles.emptyText, { color: palette.mutedForeground }]}>
                  This post does not include any content.
                </Text>
              )}
              {initialPost ? (
                <ReactionRow
                  busyAction={busyAction}
                  onReaction={onReaction}
                  post={initialPost}
                  selected={new Set(detail.viewerReactions[initialPost.id] ?? [])}
                />
              ) : null}
              <View style={styles.detailActions}>
                <Button
                  loading={busyAction === "subscribe"}
                  loadingText="Updating..."
                  onPress={onSubscribe}
                  variant={detail.isSubscribed ? "outline" : "default"}
                >
                  {detail.isSubscribed ? (
                    <>
                      <BellOff
                        color={palette.foreground}
                        size={16}
                      />
                      <Text style={[styles.outlineButtonText, { color: palette.foreground }]}>
                        Unfollow
                      </Text>
                    </>
                  ) : (
                    <>
                      <Bell color={palette.primaryForeground} size={16} />
                      <Text
                        style={[
                          styles.startButtonText,
                          { color: palette.primaryForeground },
                        ]}
                      >
                        Follow
                      </Text>
                    </>
                  )}
                </Button>
                <View style={styles.metaRow}>
                  <MetaIcon
                    icon={<MessageSquare color={palette.mutedForeground} size={14} />}
                    label={`${thread.totalReplies ?? 0} replies`}
                  />
                  <MetaIcon
                    icon={<Eye color={palette.mutedForeground} size={14} />}
                    label={`${thread.viewCount ?? 0} views`}
                  />
                </View>
              </View>
            </View>
            <View style={styles.sectionGap}>
              {replies.length === 0 ? (
                <View
                  style={[
                    styles.emptyCard,
                    { borderColor: palette.border, backgroundColor: palette.card },
                  ]}
                >
                  <Text style={[styles.emptyText, { color: palette.mutedForeground }]}>
                    No replies yet. Be the first to respond.
                  </Text>
                </View>
              ) : (
                replies.map((post) => (
                  <ReplyCard
                    busyAction={busyAction}
                    detail={detail}
                    key={post.id}
                    onReaction={onReaction}
                    post={post}
                  />
                ))
              )}
            </View>
            <View
              style={[
                styles.replyComposer,
                { borderColor: palette.border, backgroundColor: palette.card },
              ]}
            >
              <Text style={[styles.replyTitle, { color: palette.foreground }]}>
                Add a reply
              </Text>
              <Field
                editable={Boolean(viewerId)}
                multiline
                onChangeText={setReplyText}
                placeholder={
                  viewerId
                    ? "Share your insights..."
                    : "Sign in to join the conversation."
                }
                style={styles.replyInput}
                value={replyText}
              />
              <Button
                disabled={!viewerId}
                loading={busyAction === "reply"}
                loadingText="Posting..."
                onPress={onPostReply}
                style={styles.fullButton}
              >
                Post reply
              </Button>
            </View>
          </ScrollView>
        ) : null}
      </Screen>
    </Modal>
  );
}

function ReplyCard({
  busyAction,
  detail,
  onReaction,
  post,
}: {
  busyAction: string | null;
  detail: ForumThreadDetail;
  onReaction: (post: ForumPost, type: ForumReactionType) => void;
  post: ForumPost;
}) {
  const { palette } = useAppTheme();
  return (
    <View
      style={[styles.replyCard, { borderColor: palette.border, backgroundColor: palette.card }]}
    >
      <View style={styles.authorRow}>
        <ForumAvatar
          avatarUrl={post.author.avatarUrl}
          name={post.author.displayName}
          size={40}
        />
        <View style={styles.authorTextBlock}>
          <Text style={[styles.authorName, { color: palette.foreground }]}>
            {post.author.displayName}
            {post.author.isAdmin ? "  Official" : ""}
          </Text>
          <Text style={[styles.smallMuted, { color: palette.mutedForeground }]}>
            {formatRelative(post.createdAt)}
          </Text>
        </View>
      </View>
      <PostContent post={post} />
      <ReactionRow
        busyAction={busyAction}
        onReaction={onReaction}
        post={post}
        selected={new Set(detail.viewerReactions[post.id] ?? [])}
      />
    </View>
  );
}

function PostContent({ post }: { post: ForumPost }) {
  const { palette } = useAppTheme();
  const paragraphs = post.content
    .trim()
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) {
    return (
      <Text style={[styles.emptyText, { color: palette.mutedForeground }]}>
        This post does not include any content.
      </Text>
    );
  }
  return (
    <View style={styles.paragraphBlock}>
      {paragraphs.map((paragraph, index) => (
        <Text
          key={`${paragraph.slice(0, 18)}-${index}`}
          style={[styles.postText, { color: palette.foreground }]}
        >
          {paragraph}
        </Text>
      ))}
    </View>
  );
}

function ReactionRow({
  busyAction,
  onReaction,
  post,
  selected,
}: {
  busyAction: string | null;
  onReaction: (post: ForumPost, type: ForumReactionType) => void;
  post: ForumPost;
  selected: Set<ForumReactionType>;
}) {
  const { palette } = useAppTheme();
  return (
    <View style={styles.reactionRow}>
      {REACTIONS.map((reaction) => {
        const active = selected.has(reaction.type);
        const busy = busyAction === `${post.id}-${reaction.type}`;
        const textColor = active ? palette.foreground : palette.mutedForeground;
        return (
          <Pressable
            disabled={busy}
            key={reaction.type}
            onPress={() => onReaction(post, reaction.type)}
            style={[
              styles.reactionChip,
              {
                borderColor: active ? palette.primary : palette.border,
                backgroundColor: active ? palette.muted : "transparent",
                opacity: busy ? 0.6 : 1,
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={textColor} size="small" />
            ) : (
              getReactionIcon(reaction.type, textColor)
            )}
            <Text style={[styles.reactionText, { color: textColor }]}>
              {reaction.label} ({post.reactions[reaction.type] ?? 0})
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Field({
  label,
  style,
  ...props
}: React.ComponentProps<typeof TextInput> & { label?: string }) {
  const { palette } = useAppTheme();
  return (
    <View style={styles.fieldWrap}>
      {label ? (
        <Text style={[styles.fieldLabel, { color: palette.mutedForeground }]}>
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={palette.mutedForeground}
        style={[
          styles.field,
          {
            borderColor: palette.input,
            backgroundColor: props.editable === false ? palette.secondary : palette.muted,
            color: palette.foreground,
          },
          style,
        ]}
        textAlignVertical={props.multiline ? "top" : "center"}
        {...props}
      />
    </View>
  );
}

function ForumSkeleton() {
  const { palette } = useAppTheme();
  return (
    <View style={styles.skeletonStack}>
      {[0, 1, 2].map((item) => (
        <View
          key={item}
          style={[
            styles.skeletonCard,
            { borderColor: palette.border, backgroundColor: palette.card },
          ]}
        >
          <View style={[styles.skeletonLineSmall, { backgroundColor: palette.muted }]} />
          <View style={[styles.skeletonLine, { backgroundColor: palette.muted }]} />
          <View style={[styles.skeletonLineWide, { backgroundColor: palette.muted }]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  activeFilter: {
    alignItems: "center",
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing[2],
    padding: spacing[3],
  },
  activeFilterText: {
    flex: 1,
    fontSize: typography.tiny,
    fontWeight: "600",
  },
  authorName: {
    fontSize: typography.small,
    fontWeight: "700",
  },
  authorRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
  },
  authorTextBlock: {
    flex: 1,
    minWidth: 120,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    color: "#fff",
    fontWeight: "700",
  },
  backLink: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing[2],
    minHeight: 40,
  },
  backLinkText: {
    fontSize: typography.body,
    fontWeight: "600",
  },
  badge: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: spacing[2],
    paddingVertical: 3,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  categoryCount: {
    fontSize: typography.tiny,
  },
  categoryRow: {
    alignItems: "center",
    borderRadius: radius.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 38,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  categoryText: {
    flex: 1,
    fontSize: typography.small,
  },
  content: {
    gap: spacing[4],
    padding: spacing[4],
  },
  detailActions: {
    gap: spacing[3],
    paddingTop: spacing[2],
  },
  detailHero: {
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing[4],
    padding: spacing[5],
  },
  detailTitle: {
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 32,
  },
  detailsInput: {
    minHeight: 160,
  },
  dropdownEmpty: {
    fontSize: typography.tiny,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  emptyCard: {
    alignItems: "center",
    borderRadius: 18,
    borderStyle: "dashed",
    borderWidth: 1,
    gap: spacing[2],
    padding: spacing[5],
  },
  emptyText: {
    fontSize: typography.small,
    lineHeight: 21,
    textAlign: "center",
  },
  emptyTitle: {
    fontSize: typography.body,
    fontWeight: "700",
  },
  eyebrow: {
    fontSize: typography.tiny,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  field: {
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: typography.body,
    minHeight: 44,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  fieldLabel: {
    fontSize: typography.small,
    fontWeight: "600",
  },
  fieldWrap: {
    gap: spacing[2],
  },
  fullButton: {
    width: "100%",
  },
  hero: {
    borderRadius: 24,
    borderWidth: 1,
    gap: spacing[4],
    padding: spacing[6],
  },
  heroBottom: {
    gap: spacing[4],
  },
  heroSubtitle: {
    fontSize: typography.small,
    lineHeight: 22,
  },
  heroTitle: {
    fontSize: 21,
    fontWeight: "700",
    lineHeight: 26,
  },
  iconButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  listContent: {
    paddingBottom: spacing[4],
  },
  loadMoreWrap: {
    alignItems: "center",
    padding: spacing[4],
  },
  loadingCenter: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  metaItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[4],
  },
  metaText: {
    fontSize: typography.tiny,
  },
  modalContent: {
    gap: spacing[4],
    padding: spacing[4],
    paddingBottom: spacing[8],
  },
  modalHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 52,
    paddingHorizontal: spacing[4],
  },
  modalTitle: {
    flex: 1,
    fontSize: typography.subtitle,
    fontWeight: "700",
  },
  outlineButtonText: {
    fontSize: typography.small,
    fontWeight: "700",
  },
  paragraphBlock: {
    gap: spacing[3],
  },
  postText: {
    fontSize: typography.small,
    lineHeight: 23,
  },
  reactionChip: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing[1],
    minHeight: 32,
    paddingHorizontal: spacing[3],
  },
  reactionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
    paddingTop: spacing[2],
  },
  reactionText: {
    fontSize: 12,
    fontWeight: "600",
  },
  replyCard: {
    borderRadius: 18,
    borderWidth: 1,
    gap: spacing[4],
    padding: spacing[4],
  },
  replyComposer: {
    borderRadius: 18,
    borderWidth: 1,
    gap: spacing[3],
    padding: spacing[4],
  },
  replyInput: {
    minHeight: 140,
  },
  replyTitle: {
    fontSize: typography.body,
    fontWeight: "700",
  },
  resetText: {
    fontSize: typography.tiny,
    fontWeight: "700",
  },
  searchButton: {
    flex: 1,
  },
  searchButtons: {
    flexDirection: "row",
    gap: spacing[2],
  },
  searchInput: {
    flex: 1,
    fontSize: typography.small,
    minHeight: 42,
  },
  searchInputWrap: {
    alignItems: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing[2],
    paddingHorizontal: spacing[3],
  },
  filterCard: {
    borderRadius: 18,
    borderWidth: 1,
    gap: spacing[3],
    padding: spacing[3],
  },
  filterChip: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: spacing[2],
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: spacing[3],
  },
  filterChipText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  filterRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing[2],
  },
  inlineDropdown: {
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing[1],
    overflow: "hidden",
    padding: spacing[1],
  },
  sectionGap: {
    gap: spacing[3],
  },
  selectPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  selectPillText: {
    fontSize: typography.tiny,
    fontWeight: "700",
  },
  sideCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sideCardTitle: {
    fontSize: typography.tiny,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  tagsPanel: {
    borderTopWidth: 1,
    gap: spacing[3],
    paddingTop: spacing[3],
  },
  skeletonCard: {
    borderRadius: 18,
    borderWidth: 1,
    gap: spacing[3],
    padding: spacing[5],
  },
  skeletonLine: {
    borderRadius: radius.md,
    height: 18,
    opacity: 0.75,
    width: "72%",
  },
  skeletonLineSmall: {
    borderRadius: radius.md,
    height: 14,
    opacity: 0.75,
    width: "38%",
  },
  skeletonLineWide: {
    borderRadius: radius.md,
    height: 14,
    opacity: 0.75,
    width: "92%",
  },
  skeletonStack: {
    gap: spacing[3],
  },
  smallMuted: {
    fontSize: typography.tiny,
  },
  startButton: {
    alignSelf: "flex-start",
  },
  startButtonText: {
    fontSize: typography.small,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: typography.tiny,
  },
  statRow: {
    flexDirection: "row",
    gap: spacing[6],
  },
  statValue: {
    fontSize: 26,
    fontWeight: "700",
  },
  tagChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  tagChipText: {
    fontSize: typography.tiny,
    fontWeight: "700",
  },
  tagWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
  },
  threadCard: {
    borderRadius: 18,
    borderWidth: 1,
    gap: spacing[3],
    marginHorizontal: spacing[4],
    marginVertical: spacing[2],
    padding: spacing[5],
  },
  threadExcerpt: {
    fontSize: typography.small,
    lineHeight: 21,
  },
  threadTag: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
    paddingVertical: 5,
  },
  threadTagText: {
    fontSize: typography.tiny,
    fontWeight: "600",
  },
  threadTitle: {
    fontSize: typography.subtitle,
    fontWeight: "700",
    lineHeight: 26,
  },
});
