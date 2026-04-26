import * as WebBrowser from "expo-web-browser";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MessageSquareText } from "lucide-react-native";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_BASE_URL, api } from "@/api/client";
import type { JobDetailsPayload } from "@/api/types";
import { Button } from "@/components/Button";
import { JobsChatPopup } from "@/components/jobs/JobsChatPopup";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import type { RootStackParamList } from "@/navigation/types";
import { radius, spacing, typography } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";

type Props = NativeStackScreenProps<RootStackParamList, "JobDetails">;

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const { palette } = useAppTheme();

  return (
    <Text style={[styles.detailRowText, { color: palette.foreground }]}>
      <Text style={styles.detailRowLabel}>{label}</Text> {value}
    </Text>
  );
}

function DetailCard({
  children,
}: {
  children: ReactNode;
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
      {children}
    </View>
  );
}

export function JobDetailsScreen({ navigation, route }: Props) {
  const { palette } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { id } = route.params;
  const [details, setDetails] = useState<JobDetailsPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpeningSource, setIsOpeningSource] = useState(false);
  const [isOpeningPdf, setIsOpeningPdf] = useState(false);
  const [isPdfPreviewLoading, setIsPdfPreviewLoading] = useState(true);
  const [hasPdfPreviewError, setHasPdfPreviewError] = useState(false);
  const [isChatVisible, setIsChatVisible] = useState(false);

  const loadDetails = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const payload = await api.jobDetails(id);
      setDetails(payload);
      setIsPdfPreviewLoading(Boolean(payload.pdfPreviewImageUrl));
      setHasPdfPreviewError(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load job details."
      );
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDetails().catch(() => undefined);
  }, [loadDetails]);

  const openSource = useCallback(async () => {
    if (!details?.sourceUrl) {
      return;
    }
    setIsOpeningSource(true);
    try {
      await WebBrowser.openBrowserAsync(details.sourceUrl);
    } finally {
      setIsOpeningSource(false);
    }
  }, [details?.sourceUrl]);

  const openPdf = useCallback(async () => {
    if (!details?.pdfUrl) {
      return;
    }
    setIsOpeningPdf(true);
    try {
      await WebBrowser.openBrowserAsync(`${API_BASE_URL}${details.pdfUrl}`);
    } finally {
      setIsOpeningPdf(false);
    }
  }, [details?.pdfUrl]);

  const openAsk = useCallback(() => {
    setIsChatVisible(true);
  }, []);

  return (
    <Screen padded={false} style={styles.screen}>
      <JobsChatPopup
        detailJobContext={
          details
            ? {
                id: details.id,
                title: details.title,
                company: details.company,
                location: details.location,
              }
            : null
        }
        onClose={() => setIsChatVisible(false)}
        onOpenJobDetails={(jobId) => {
          setIsChatVisible(false);
          if (jobId !== id) {
            navigation.push("JobDetails", { id: jobId });
          }
        }}
        visible={isChatVisible}
      />
      <View style={styles.content}>
        <PageHeader compact fallbackScreen="Jobs" title="Back to jobs" />

        {isLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={palette.foreground} />
          </View>
        ) : error || !details ? (
          <DetailCard>
            <Text style={[styles.errorTitle, { color: palette.foreground }]}>
              Unable to load job details
            </Text>
            <Text style={[styles.errorBody, { color: palette.mutedForeground }]}>
              {error ?? "Please try again."}
            </Text>
            <Button onPress={() => void loadDetails()} style={styles.retryButton}>
              Retry
            </Button>
          </DetailCard>
        ) : (
          <>
            <DetailCard>
              <View style={styles.headerBlock}>
                <Text style={[styles.title, { color: palette.foreground }]}>
                  {details.title}
                </Text>
                <Text
                  style={[
                    styles.subtitle,
                    { color: palette.mutedForeground },
                  ]}
                >
                  {details.companyLocationLabel}
                </Text>
              </View>

              <View style={styles.detailGrid}>
                <DetailRow label="Location:" value={details.location} />
                <DetailRow label="Type:" value={details.employmentType} />
                <DetailRow label="Salary:" value={details.salaryLabel} />
                <DetailRow
                  label="Notification date:"
                  value={details.notificationDateLabel}
                />
                <DetailRow label="Fetched on:" value={details.fetchedOnLabel} />
                <DetailRow label="Source:" value={details.sourceLabel} />
              </View>

              <View style={styles.buttonGroup}>
                {details.sourceUrl ? (
                  <Button
                    loading={isOpeningSource}
                    loadingText="Opening..."
                    onPress={() => void openSource()}
                    style={styles.fullWidthButton}
                    variant="outline"
                  >
                    Open source listing
                  </Button>
                ) : null}
                {details.pdfUrl ? (
                  <Button
                    loading={isOpeningPdf}
                    loadingText="Opening..."
                    onPress={() => void openPdf()}
                    style={styles.fullWidthButton}
                    variant="outline"
                  >
                    Open PDF file
                  </Button>
                ) : null}
              </View>
            </DetailCard>

            {details.pdfUrl ? (
              <DetailCard>
                <Text style={[styles.sectionTitle, { color: palette.foreground }]}>
                  Relevant file
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void openPdf()}
                  style={({ pressed }) => [
                    styles.inlineLinkWrap,
                    { opacity: pressed ? 0.76 : 1 },
                  ]}
                >
                  <Text style={[styles.inlineLink, { color: palette.foreground }]}>
                    Open PDF file
                  </Text>
                </Pressable>

                {details.pdfPreviewImageUrl ? (
                  <View
                    style={[
                      styles.previewWrap,
                      {
                        backgroundColor: palette.background,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    <Image
                      onError={() => {
                        setHasPdfPreviewError(true);
                        setIsPdfPreviewLoading(false);
                      }}
                      onLoadEnd={() => setIsPdfPreviewLoading(false)}
                      onLoadStart={() => {
                        setHasPdfPreviewError(false);
                        setIsPdfPreviewLoading(true);
                      }}
                      resizeMode="contain"
                      source={{ uri: `${API_BASE_URL}${details.pdfPreviewImageUrl}` }}
                      style={styles.previewImage}
                    />
                    {isPdfPreviewLoading ? (
                      <View
                        style={[
                          styles.previewLoadingOverlay,
                          { backgroundColor: palette.background },
                        ]}
                      >
                        <ActivityIndicator color={palette.foreground} />
                      </View>
                    ) : null}
                    {hasPdfPreviewError ? (
                      <View
                        style={[
                          styles.previewFallback,
                          { backgroundColor: palette.muted },
                        ]}
                      >
                        <Text
                          style={[
                            styles.previewFallbackText,
                            { color: palette.mutedForeground },
                          ]}
                        >
                          Preview unavailable. Open the PDF file above.
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View
                    style={[
                      styles.previewFallback,
                      { backgroundColor: palette.muted },
                    ]}
                  >
                    <Text
                      style={[
                        styles.previewFallbackText,
                        { color: palette.mutedForeground },
                      ]}
                    >
                      Preview unavailable. Open the PDF file above.
                    </Text>
                  </View>
                )}
              </DetailCard>
            ) : null}

            {details.sourceUrl ? (
              <DetailCard>
                <Text style={[styles.sectionTitle, { color: palette.foreground }]}>
                  Original source page
                </Text>
                <Text
                  style={[
                    styles.sectionBody,
                    { color: palette.mutedForeground },
                  ]}
                >
                  Open the original listing in a new tab.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void openSource()}
                  style={({ pressed }) => [
                    styles.inlineLinkWrap,
                    { opacity: pressed ? 0.76 : 1 },
                  ]}
                >
                  <Text style={[styles.inlineLink, { color: palette.foreground }]}>
                    Open source page in new tab
                  </Text>
                </Pressable>
              </DetailCard>
            ) : null}
          </>
        )}
      </View>

      {details ? (
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
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
    paddingBottom: spacing[8],
  },
  content: {
    gap: spacing[4],
  },
  centerState: {
    minHeight: 240,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[5],
    gap: spacing[4],
  },
  headerBlock: {
    gap: spacing[2],
  },
  title: {
    fontSize: 24,
    lineHeight: 36,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  detailGrid: {
    gap: spacing[2],
  },
  detailRowText: {
    fontSize: 15,
    lineHeight: 24,
  },
  detailRowLabel: {
    fontWeight: "700",
  },
  buttonGroup: {
    gap: spacing[2],
  },
  fullWidthButton: {
    minHeight: 44,
    width: "100%",
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: typography.subtitle,
    fontWeight: "700",
  },
  sectionBody: {
    fontSize: typography.body,
    lineHeight: 24,
  },
  inlineLinkWrap: {
    alignSelf: "flex-start",
  },
  inlineLink: {
    fontSize: 15,
    textDecorationLine: "underline",
  },
  previewWrap: {
    overflow: "hidden",
    minHeight: 620,
    borderTopWidth: 1,
    paddingTop: spacing[3],
  },
  previewImage: {
    minHeight: 580,
    width: "100%",
    aspectRatio: 0.72,
  },
  previewLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  previewFallback: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
  },
  previewFallbackText: {
    fontSize: typography.small,
    lineHeight: 22,
    textAlign: "center",
  },
  errorTitle: {
    fontSize: typography.subtitle,
    fontWeight: "700",
  },
  errorBody: {
    fontSize: typography.body,
    lineHeight: 24,
  },
  retryButton: {
    alignSelf: "flex-start",
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
});
