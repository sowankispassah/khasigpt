import * as WebBrowser from "expo-web-browser";
import {
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  FileText,
  MapPin,
  MessageSquareText,
  Search,
  X,
} from "lucide-react-native";
import {
  type ReactNode,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation, useRoute } from "@react-navigation/native";
import {
  ActivityIndicator,
  FlatList,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_BASE_URL, api } from "@/api/client";
import type { JobListItem } from "@/api/types";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/Button";
import { JobsChatPopup } from "@/components/jobs/JobsChatPopup";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import type { MainTabParamList, RootStackParamList } from "@/navigation/types";
import { radius, spacing, typography } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";

type JobsLocalFilters = {
  company: string;
  location: string;
  q: string;
  type: string;
};

type FilterSheet = "company" | "location" | "type" | null;
type FilterAnchor = {
  left: number;
  top: number;
  width: number;
};

const EMPTY_FILTERS: JobsLocalFilters = {
  company: "",
  location: "",
  q: "",
  type: "",
};

const JOBS_PAGE_SIZE = 12;

function normalizeFilter(value: string) {
  return value.trim().toLowerCase();
}

function getJobTypeLabel(value: string) {
  const normalized = normalizeFilter(value);
  if (!normalized) {
    return "Other";
  }
  if (normalized === "government") {
    return "Government";
  }
  if (normalized === "private") {
    return "Private";
  }
  return value.trim();
}

function JobsSkeleton() {
  const { palette } = useAppTheme();

  return (
    <View style={styles.skeletonWrap}>
      <View
        style={[
          styles.searchCard,
          {
            backgroundColor: palette.background,
            borderColor: palette.border,
          },
        ]}
      >
        <View
          style={[
            styles.skeletonSearch,
            { backgroundColor: palette.muted, opacity: 0.72 },
          ]}
        />
        <View style={styles.skeletonFilterRow}>
          {[1, 2, 3].map((item) => (
            <View
              key={item}
              style={[
                styles.skeletonFilterChip,
                { backgroundColor: palette.muted, opacity: 0.72 },
              ]}
            />
          ))}
        </View>
      </View>
      {[1, 2, 3, 4].map((item) => (
        <View
          key={item}
          style={[
            styles.skeletonCard,
            {
              backgroundColor: palette.background,
              borderColor: palette.border,
            },
          ]}
        >
          <View
            style={[
              styles.skeletonLineShort,
              { backgroundColor: palette.muted, opacity: 0.7 },
            ]}
          />
          <View
            style={[
              styles.skeletonLineTall,
              { backgroundColor: palette.muted, opacity: 0.7 },
            ]}
          />
          <View style={styles.skeletonPillRow}>
            <View
              style={[
                styles.skeletonPill,
                { backgroundColor: palette.muted, opacity: 0.6 },
              ]}
            />
            <View
              style={[
                styles.skeletonPill,
                { backgroundColor: palette.muted, opacity: 0.6 },
              ]}
            />
          </View>
          <View
            style={[
              styles.skeletonSalary,
              { backgroundColor: palette.muted, opacity: 0.56 },
            ]}
          />
          <View style={styles.skeletonBottomRow}>
            <View
              style={[
                styles.skeletonMeta,
                { backgroundColor: palette.muted, opacity: 0.56 },
              ]}
            />
            <View
              style={[
                styles.skeletonButton,
                { backgroundColor: palette.muted, opacity: 0.72 },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function FilterChip({
  label,
  onLayout,
  onPress,
  value,
}: {
  label: string;
  onLayout: (event: LayoutChangeEvent) => void;
  onPress: (event: GestureResponderEvent) => void;
  value: string;
}) {
  const { palette } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onLayout={onLayout}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
          opacity: pressed ? 0.82 : 1,
        },
      ]}
    >
      <Text
        numberOfLines={1}
        style={[styles.filterChipText, { color: palette.foreground }]}
      >
        {value || label}
      </Text>
      <View pointerEvents="none" style={styles.filterChipIcon}>
        <ChevronDown color={palette.mutedForeground} size={14} />
      </View>
    </Pressable>
  );
}

function FilterSheetModal({
  anchor,
  onClose,
  onSelect,
  options,
  value,
  visible,
}: {
  anchor: FilterAnchor | null;
  onClose: () => void;
  onSelect: (value: string) => void;
  options: string[];
  value: string;
  visible: boolean;
}) {
  const { palette } = useAppTheme();
  const { width: viewportWidth } = useWindowDimensions();

  const longestLabelLength = useMemo(
    () =>
      options.reduce((longest, item) => {
        const label = item || "All";
        return Math.max(longest, label.length);
      }, 0),
    [options]
  );
  const estimatedTextWidth = longestLabelLength * 9.25;
  const dropdownWidth = Math.min(
    Math.max(estimatedTextWidth + 72, anchor?.width ?? 0, 160),
    viewportWidth - spacing[4] * 2
  );
  const left = Math.min(
    Math.max(anchor?.left ?? spacing[4], spacing[4]),
    Math.max(spacing[4], viewportWidth - dropdownWidth - spacing[4])
  );
  const top = anchor?.top ?? 120;

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.modalLayer}>
        <Pressable onPress={onClose} style={styles.modalBackdrop} />
        <View
          style={[
            styles.modalCard,
            {
              backgroundColor: palette.popover,
              borderColor: palette.border,
              left,
              top,
              width: dropdownWidth,
            },
          ]}
        >
          <FlatList
            data={options}
            keyExtractor={(item) => item || "__all__"}
            renderItem={({ item }) => {
              const isActive = item === value;
              const label = item || "All";
              return (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onSelect(item)}
                  style={({ pressed }) => [
                    styles.modalOption,
                    {
                      backgroundColor: isActive ? palette.muted : "transparent",
                      opacity: pressed ? 0.82 : 1,
                    },
                  ]}
                >
                  <Text
                    ellipsizeMode="tail"
                    numberOfLines={1}
                    style={[
                      styles.modalOptionText,
                      { color: palette.foreground },
                    ]}
                  >
                    {label}
                  </Text>
                  {isActive ? <Check color={palette.foreground} size={16} /> : null}
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

function JobsCard({
  isDetailsLoading,
  isSourceLoading,
  job,
  onOpenDetails,
  onOpenSource,
}: {
  isDetailsLoading: boolean;
  isSourceLoading: boolean;
  job: JobListItem;
  onOpenDetails: () => void;
  onOpenSource: () => void;
}) {
  const { palette } = useAppTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderCopy}>
          <View style={styles.sourceRow}>
            <Building2 color={palette.mutedForeground} size={13} />
            <Text
              numberOfLines={1}
              style={[styles.sourceLabel, { color: palette.mutedForeground }]}
            >
              {job.sourceLabel}
            </Text>
          </View>
          <Text
            ellipsizeMode="tail"
            numberOfLines={2}
            style={[styles.cardTitle, { color: palette.foreground }]}
          >
            {job.title}
          </Text>
        </View>
        {job.hasPdfFile ? (
          <Pressable
            accessibilityRole="button"
            disabled={isSourceLoading}
            onPress={onOpenSource}
            style={({ pressed }) => [
              styles.pdfIconWrap,
              {
                backgroundColor: "#e8faf3",
                borderColor: "#a7f3d0",
                opacity: isSourceLoading ? 0.66 : pressed ? 0.82 : 1,
              },
            ]}
          >
            {isSourceLoading ? (
              <ActivityIndicator color="#059669" size="small" />
            ) : (
              <FileText color="#059669" size={14} />
            )}
          </Pressable>
        ) : null}
      </View>

      <View style={styles.pillsRow}>
        <View style={[styles.pill, { backgroundColor: palette.muted }]}>
          <MapPin color={palette.mutedForeground} size={12} />
          <Text style={[styles.pillText, { color: palette.mutedForeground }]}>
            {job.location}
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: palette.muted }]}>
          <BriefcaseBusiness color={palette.mutedForeground} size={12} />
          <Text style={[styles.pillText, { color: palette.mutedForeground }]}>
            {getJobTypeLabel(job.employmentType)}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.salaryWrap,
          {
            backgroundColor: palette.background,
            borderColor: palette.border,
          },
        ]}
      >
        <Text style={[styles.salaryText, { color: palette.foreground }]}>
          <Text style={{ color: palette.mutedForeground }}>Salary:</Text>{" "}
          {job.salaryLabel}
        </Text>
      </View>

      <View style={styles.cardFooter}>
        <View style={[styles.metaWrap, { backgroundColor: palette.muted }]}>
          <Text style={[styles.metaText, { color: palette.foreground }]}>
            Fetched: {job.fetchedOnLabel}
          </Text>
        </View>

        <Button
          loading={isDetailsLoading}
          loadingText="Opening..."
          onPress={onOpenDetails}
          style={styles.detailsButton}
        >
          View details
        </Button>
      </View>
    </View>
  );
}

function EmptyJobsState({ children }: { children: ReactNode }) {
  const { palette } = useAppTheme();

  return (
    <View
      style={[
        styles.emptyState,
        { backgroundColor: palette.background, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.emptyStateText, { color: palette.mutedForeground }]}>
        {children}
      </Text>
    </View>
  );
}

export function JobsScreen() {
  const { palette } = useAppTheme();
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<BottomTabNavigationProp<MainTabParamList, "Jobs">>();
  const route = useRoute<RouteProp<MainTabParamList, "Jobs">>();
  const rootNavigation =
    navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
  const [filterAnchor, setFilterAnchor] = useState<FilterAnchor | null>(null);
  const [filterChipLayouts, setFilterChipLayouts] = useState<
    Record<Exclude<FilterSheet, null>, { height: number; width: number }>
  >({
    company: { height: 32, width: 108 },
    location: { height: 32, width: 108 },
    type: { height: 32, width: 108 },
  });
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<JobsLocalFilters>(EMPTY_FILTERS);
  const deferredFilters = useDeferredValue(filters);
  const [visibleCount, setVisibleCount] = useState(JOBS_PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [pendingDetailsId, setPendingDetailsId] = useState<string | null>(null);
  const [pendingSourceId, setPendingSourceId] = useState<string | null>(null);
  const [filterSheet, setFilterSheet] = useState<FilterSheet>(null);
  const [isChatVisible, setIsChatVisible] = useState(false);
  const restoredChatId =
    route.params?.openAsk && route.params.chatId ? route.params.chatId : null;

  const loadJobs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const nextJobs = await api.jobs();
      setJobs(nextJobs);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load jobs."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs().catch(() => undefined);
  }, [loadJobs]);

  const companies = useMemo(
    () =>
      Array.from(new Set(jobs.map((job) => job.company.trim()).filter(Boolean))).sort(
        (left, right) => left.localeCompare(right)
      ),
    [jobs]
  );
  const locations = useMemo(
    () =>
      Array.from(new Set(jobs.map((job) => job.location.trim()).filter(Boolean))).sort(
        (left, right) => left.localeCompare(right)
      ),
    [jobs]
  );
  const types = useMemo(
    () =>
      Array.from(
        new Set(jobs.map((job) => getJobTypeLabel(job.employmentType)).filter(Boolean))
      ).sort((left, right) => left.localeCompare(right)),
    [jobs]
  );

  const filteredJobs = useMemo(() => {
    const qFilter = normalizeFilter(deferredFilters.q);
    const companyFilter = normalizeFilter(deferredFilters.company);
    const locationFilter = normalizeFilter(deferredFilters.location);
    const typeFilter = normalizeFilter(deferredFilters.type);

    return jobs.filter((job) => {
      if (companyFilter && normalizeFilter(job.company) !== companyFilter) {
        return false;
      }
      if (locationFilter && normalizeFilter(job.location) !== locationFilter) {
        return false;
      }
      if (typeFilter && normalizeFilter(getJobTypeLabel(job.employmentType)) !== typeFilter) {
        return false;
      }
      if (!qFilter) {
        return true;
      }

      const haystack = [
        job.title,
        job.company,
        job.location,
        job.employmentType,
        job.descriptionSnippet,
        job.salaryLabel,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(qFilter);
    });
  }, [deferredFilters, jobs]);

  useEffect(() => {
    startTransition(() => {
      setVisibleCount(Math.min(JOBS_PAGE_SIZE, filteredJobs.length));
      setIsLoadingMore(false);
    });
  }, [filteredJobs.length]);

  const visibleJobs = useMemo(
    () => filteredJobs.slice(0, visibleCount),
    [filteredJobs, visibleCount]
  );
  const hasMoreJobs = visibleCount < filteredJobs.length;
  const hasActiveFilters = useMemo(
    () =>
      Object.values(filters).some(
        (value) => typeof value === "string" && value.trim().length > 0
      ),
    [filters]
  );

  const handleManualLoadMore = useCallback(() => {
    if (isLoadingMore) {
      return;
    }
    setIsLoadingMore(true);
    setTimeout(() => {
      setVisibleCount((current) =>
        Math.min(current + JOBS_PAGE_SIZE, filteredJobs.length)
      );
      setIsLoadingMore(false);
    }, 120);
  }, [filteredJobs.length, isLoadingMore]);

  const openDetails = useCallback(async (jobId: string) => {
    setPendingDetailsId(jobId);
    try {
      rootNavigation?.navigate("JobDetails", { id: jobId });
    } finally {
      setPendingDetailsId((current) => (current === jobId ? null : current));
    }
  }, [rootNavigation]);

  const openSource = useCallback(async (job: JobListItem) => {
    if (!job.sourceUrl) {
      return;
    }
    setPendingSourceId(job.id);
    try {
      await WebBrowser.openBrowserAsync(job.sourceUrl);
    } finally {
      setPendingSourceId((current) => (current === job.id ? null : current));
    }
  }, []);

  const openAsk = useCallback(() => {
    navigation.setParams({
      chatId: undefined,
      openAsk: true,
    });
    setIsChatVisible(true);
  }, [navigation]);

  const openSidebar = useCallback(() => {
    setIsSidebarVisible(true);
  }, []);

  useEffect(() => {
    if (!route.params?.openAsk) {
      return;
    }

    setIsChatVisible(true);
  }, [route.params?.chatId, route.params?.openAsk]);

  const openFilterMenu = useCallback(
    (sheet: Exclude<FilterSheet, null>, event: GestureResponderEvent) => {
      const layout = filterChipLayouts[sheet];
      const { pageX, pageY } = event.nativeEvent;
      setFilterSheet(sheet);
      setFilterAnchor({
        left: pageX - layout.width / 2,
        top: pageY + layout.height / 2 + 8,
        width: layout.width,
      });
    },
    [filterChipLayouts]
  );

  const header = (
    <View style={styles.headerContent}>
      <View
        style={[
          styles.searchCard,
          {
            backgroundColor: palette.background,
            borderColor: palette.border,
          },
        ]}
      >
        <View
          style={[
            styles.searchField,
            {
              backgroundColor: palette.background,
              borderColor: palette.border,
            },
          ]}
        >
          <Search color={palette.mutedForeground} size={16} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(q) =>
              setFilters((previous) => ({
                ...previous,
                q,
              }))
            }
            placeholder="Search jobs by title, company, location, or salary"
            placeholderTextColor={palette.mutedForeground}
            style={[styles.searchInput, { color: palette.foreground }]}
            value={filters.q}
          />
          {filters.q ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                setFilters((previous) => ({
                  ...previous,
                  q: "",
                }))
              }
              style={({ pressed }) => [
                styles.clearSearchButton,
                { opacity: pressed ? 0.72 : 1 },
              ]}
            >
              <X color={palette.mutedForeground} size={16} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.filterRow}>
          <FilterChip
            label="All companies"
            onLayout={(event) => {
              const { height, width } = event.nativeEvent.layout;
              setFilterChipLayouts((current) => ({
                ...current,
                company: { height, width },
              }));
            }}
            onPress={(event) => openFilterMenu("company", event)}
            value={filters.company}
          />
          <FilterChip
            label="All locations"
            onLayout={(event) => {
              const { height, width } = event.nativeEvent.layout;
              setFilterChipLayouts((current) => ({
                ...current,
                location: { height, width },
              }));
            }}
            onPress={(event) => openFilterMenu("location", event)}
            value={filters.location}
          />
          <FilterChip
            label="All job types"
            onLayout={(event) => {
              const { height, width } = event.nativeEvent.layout;
              setFilterChipLayouts((current) => ({
                ...current,
                type: { height, width },
              }));
            }}
            onPress={(event) => openFilterMenu("type", event)}
            value={filters.type}
          />
          {hasActiveFilters ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setFilters(EMPTY_FILTERS)}
              style={({ pressed }) => [
                styles.resetChip,
                {
                  backgroundColor: palette.background,
                  borderColor: palette.border,
                  opacity: pressed ? 0.82 : 1,
                },
              ]}
            >
              <X color={palette.foreground} size={14} />
              <Text style={[styles.resetChipText, { color: palette.foreground }]}>
                Reset
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Text style={[styles.countText, { color: palette.mutedForeground }]}>
        Showing {visibleJobs.length} of {filteredJobs.length} job
        {filteredJobs.length === 1 ? "" : "s"}
      </Text>
    </View>
  );

  return (
    <Screen padded={false} scroll={false} style={styles.screen}>
      <AppSidebar
        onClose={() => setIsSidebarVisible(false)}
        visible={isSidebarVisible}
      />
      <PageHeader
        compact
        leftControl="sidebar"
        onHomePress={() => navigation.navigate("Chat")}
        onSidebarPress={openSidebar}
        showHomeButton
        title="Jobs"
      />
      <JobsChatPopup
        activeChatId={restoredChatId}
        onClose={() => {
          setIsChatVisible(false);
          navigation.setParams({
            chatId: undefined,
            openAsk: false,
          });
        }}
        onOpenJobDetails={(jobId) => {
          setIsChatVisible(false);
          navigation.setParams({
            chatId: undefined,
            openAsk: false,
          });
          void openDetails(jobId);
        }}
        visible={isChatVisible}
      />
      <FilterSheetModal
        anchor={filterAnchor}
        onClose={() => setFilterSheet(null)}
        onSelect={(value) => {
          setFilters((previous) => ({ ...previous, company: value }));
          setFilterSheet(null);
          setFilterAnchor(null);
        }}
        options={["", ...companies]}
        value={filters.company}
        visible={filterSheet === "company"}
      />
      <FilterSheetModal
        anchor={filterAnchor}
        onClose={() => setFilterSheet(null)}
        onSelect={(value) => {
          setFilters((previous) => ({ ...previous, location: value }));
          setFilterSheet(null);
          setFilterAnchor(null);
        }}
        options={["", ...locations]}
        value={filters.location}
        visible={filterSheet === "location"}
      />
      <FilterSheetModal
        anchor={filterAnchor}
        onClose={() => setFilterSheet(null)}
        onSelect={(value) => {
          setFilters((previous) => ({ ...previous, type: value }));
          setFilterSheet(null);
          setFilterAnchor(null);
        }}
        options={["", ...types]}
        value={filters.type}
        visible={filterSheet === "type"}
      />

      {isLoading ? (
        <FlatList
          ListHeaderComponent={header}
          contentContainerStyle={styles.listContent}
          data={[]}
          keyExtractor={(item) => item}
          ListFooterComponent={<JobsSkeleton />}
          renderItem={null}
        />
      ) : error ? (
        <FlatList
          ListHeaderComponent={header}
          contentContainerStyle={styles.listContent}
          data={[]}
          keyExtractor={(item) => item}
          ListFooterComponent={
            <EmptyJobsState>
              Unable to load jobs. Check your connection and try again.
            </EmptyJobsState>
          }
          renderItem={null}
        />
      ) : (
        <>
          <FlatList
            contentContainerStyle={styles.listContent}
            data={visibleJobs}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <EmptyJobsState>No jobs match the current filters.</EmptyJobsState>
            }
            ListFooterComponent={
              <View style={styles.footerWrap}>
                {hasMoreJobs ? (
                  <Button
                    loading={isLoadingMore}
                    loadingText="Loading..."
                    onPress={handleManualLoadMore}
                    style={[
                      styles.loadMoreButton,
                      {
                        backgroundColor: palette.background,
                        borderColor: palette.border,
                      },
                    ]}
                    variant="outline"
                  >
                    Load more jobs
                  </Button>
                ) : filteredJobs.length > 0 ? (
                  <Text
                    style={[styles.noMoreText, { color: palette.mutedForeground }]}
                  >
                    No more jobs to load.
                  </Text>
                ) : null}
              </View>
            }
            ItemSeparatorComponent={() => <View style={styles.cardSpacer} />}
            ListHeaderComponent={header}
            renderItem={({ item }) => (
              <JobsCard
                isDetailsLoading={pendingDetailsId === item.id}
                isSourceLoading={pendingSourceId === item.id}
                job={item}
                onOpenDetails={() => {
                  void openDetails(item.id);
                }}
                onOpenSource={() => {
                  void openSource(item);
                }}
              />
            )}
          />

          <Pressable
            accessibilityRole="button"
            onPress={openAsk}
            style={({ pressed }) => [
              styles.floatingAskButton,
              {
                backgroundColor: palette.background,
                borderColor: palette.border,
                bottom: Math.max(insets.bottom, 16) + 12,
                opacity: pressed ? 0.82 : 1,
              },
            ]}
          >
            <Text style={[styles.floatingAskText, { color: palette.foreground }]}>
              Ask
            </Text>
            <MessageSquareText color={palette.foreground} size={18} />
          </Pressable>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing[4],
    paddingBottom: 120,
  },
  headerContent: {
    paddingBottom: spacing[4],
    gap: spacing[2],
  },
  searchCard: {
    borderWidth: 1,
    borderRadius: 28,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  searchField: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  clearSearchButton: {
    height: 24,
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterChip: {
    minHeight: 32,
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
    paddingHorizontal: 12,
    position: "relative",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "500",
    maxWidth: "100%",
    paddingRight: 18,
    textAlign: "center",
  },
  filterChipIcon: {
    position: "absolute",
    right: 10,
  },
  resetChip: {
    minHeight: 32,
    borderWidth: 1,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
  },
  resetChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  countText: {
    fontSize: 13,
  },
  cardSpacer: {
    height: spacing[3],
  },
  card: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 20,
    gap: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardHeaderCopy: {
    flex: 1,
    gap: 8,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sourceLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: "500",
  },
  cardTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "700",
  },
  pdfIconWrap: {
    height: 28,
    width: 28,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    minHeight: 24,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: {
    fontSize: 11,
    fontWeight: "500",
  },
  salaryWrap: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 20,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  salaryText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  metaWrap: {
    flex: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  metaText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  detailsButton: {
    minHeight: 38,
    minWidth: 96,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  emptyState: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[6],
  },
  emptyStateText: {
    textAlign: "center",
    fontSize: typography.small,
    lineHeight: 21,
  },
  footerWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: spacing[4],
  },
  loadMoreButton: {
    minHeight: 34,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  noMoreText: {
    fontSize: 12,
    textAlign: "center",
  },
  floatingAskButton: {
    position: "absolute",
    right: 20,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 21,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 12,
  },
  floatingAskText: {
    fontSize: 16,
    fontWeight: "500",
  },
  modalLayer: {
    flex: 1,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  modalCard: {
    position: "absolute",
    maxHeight: 442,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: spacing[1],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 18,
  },
  modalOption: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
  },
  modalOptionText: {
    fontSize: typography.body,
    flexShrink: 1,
    marginRight: spacing[3],
  },
  skeletonWrap: {
    gap: spacing[3],
  },
  skeletonSearch: {
    height: 46,
    borderRadius: 22,
  },
  skeletonFilterRow: {
    flexDirection: "row",
    gap: 8,
  },
  skeletonFilterChip: {
    height: 32,
    width: 92,
    borderRadius: 16,
  },
  skeletonCard: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 20,
    gap: 16,
  },
  skeletonLineShort: {
    height: 12,
    width: "42%",
    borderRadius: 6,
  },
  skeletonLineTall: {
    height: 42,
    width: "88%",
    borderRadius: 12,
  },
  skeletonPillRow: {
    flexDirection: "row",
    gap: 8,
  },
  skeletonPill: {
    height: 24,
    width: 84,
    borderRadius: 12,
  },
  skeletonSalary: {
    height: 42,
    borderRadius: 20,
  },
  skeletonBottomRow: {
    flexDirection: "row",
    gap: 10,
  },
  skeletonMeta: {
    flex: 1,
    height: 48,
    borderRadius: 18,
  },
  skeletonButton: {
    width: 98,
    height: 38,
    borderRadius: 10,
  },
});
