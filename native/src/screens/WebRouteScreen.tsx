import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE_URL } from "@/api/client";
import { PageHeader } from "@/components/PageHeader";
import { Screen } from "@/components/Screen";
import type { MainTabParamList } from "@/navigation/types";
import { spacing, typography } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";

type WebRouteScreenProps = {
  path: string;
  routeName?: keyof MainTabParamList;
  title: string;
};

function buildWebUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function buildEmbeddedNativeUrl(path: string) {
  const url = new URL(buildWebUrl(path));
  url.searchParams.set("embedded", "native");
  return url.toString();
}

function getWebRouteSkeletonKind(path: string) {
  if (path.startsWith("/chat?mode=jobs") || path.startsWith("/chat?mode=study")) {
    return "feed";
  }
  if (path.startsWith("/calculator")) {
    return "tool";
  }
  if (path.startsWith("/forum")) {
    return "forum";
  }
  if (path.startsWith("/subscriptions") || path.startsWith("/recharge")) {
    return "billing";
  }
  return "legal";
}

function getWebRouteSubtitle(path: string) {
  if (path.startsWith("/chat?mode=study")) {
    return "Open the full study chat flow with prompt chips and backend-backed study context.";
  }
  if (path.startsWith("/chat?mode=jobs")) {
    return "Browse the live jobs experience with backend data and the existing jobs chat flow.";
  }
  if (path.startsWith("/calculator")) {
    return "Use the same calculator, GST, and in-words features as the web app.";
  }
  if (path.startsWith("/forum")) {
    return "Browse the existing community forum in the same scroll flow as the rest of the app.";
  }
  if (path.startsWith("/subscriptions")) {
    return "Review your subscription details and billing history without switching layouts.";
  }
  if (path.startsWith("/recharge")) {
    return "Upgrade your plan and manage credits with the same page header layout.";
  }
  return "Open the web page inside the native app with the same header behavior as Profile.";
}

function resolveTabRouteFromUrl(url: URL): keyof MainTabParamList | null {
  if (url.pathname === "/calculator") {
    return "Calculator";
  }
  if (url.pathname === "/forum") {
    return "Forum";
  }
  if (url.pathname === "/subscriptions") {
    return "Subscriptions";
  }
  if (url.pathname === "/recharge") {
    return "Recharge";
  }
  if (url.pathname === "/about") {
    return url.hash === "#contact" ? "Contact" : "About";
  }
  if (url.pathname === "/privacy-policy") {
    return "PrivacyPolicy";
  }
  if (url.pathname === "/terms-of-service") {
    return "TermsOfService";
  }
  if (url.pathname === "/chat") {
    const mode = url.searchParams.get("mode");
    if (mode === "study") {
      return "Study";
    }
    if (mode === "jobs") {
      return "Jobs";
    }
    return "Chat";
  }
  if (url.pathname.startsWith("/chat/")) {
    const mode = url.searchParams.get("mode");
    if (mode === "study") {
      return "Study";
    }
    if (mode === "jobs") {
      return "Jobs";
    }
    return "Chat";
  }
  return null;
}

export function WebRouteScreen({ path, routeName, title }: WebRouteScreenProps) {
  const { palette } = useAppTheme();
  const navigation =
    useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const webViewRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [canWebViewGoBack, setCanWebViewGoBack] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [contentHeight, setContentHeight] = useState(960);
  const uri = useMemo(() => buildWebUrl(path), [path]);
  const nativeUri = useMemo(() => buildEmbeddedNativeUrl(path), [path]);
  const nativeSource = useMemo(() => ({ uri: nativeUri }), [nativeUri]);
  const skeletonKind = useMemo(() => getWebRouteSkeletonKind(path), [path]);
  const subtitle = useMemo(() => getWebRouteSubtitle(path), [path]);
  const shouldUseAggressiveLoadFallback = useMemo(
    () =>
      path.startsWith("/chat?mode=study") ||
      path.startsWith("/chat?mode=jobs") ||
      path.startsWith("/calculator"),
    [path]
  );
  const shouldRedirectOnWeb = useMemo(
    () =>
      path.startsWith("/chat?mode=study") ||
      path.startsWith("/chat?mode=jobs") ||
      path.startsWith("/calculator"),
    [path]
  );

  const reload = useCallback(() => {
    setHasError(false);
    setIsLoading(true);
    setContentHeight(960);
    setReloadKey((key) => key + 1);
  }, []);

  const clearLoadingMask = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleNavigationRequest = useCallback(
    (request: { url?: string }) => {
      const nextUrl = request.url;
      if (!nextUrl) {
        return true;
      }

      try {
        const parsed = new URL(nextUrl);
        const base = new URL(API_BASE_URL);
        const isSameOrigin = parsed.origin === base.origin;
        if (isSameOrigin) {
          const targetRoute = resolveTabRouteFromUrl(parsed);
          if (targetRoute && targetRoute !== routeName) {
            navigation.navigate(targetRoute);
            return false;
          }
        }
      } catch {
        return true;
      }

      return true;
    },
    [navigation, routeName]
  );

  const handleBack = useCallback(() => {
    if (canWebViewGoBack) {
      webViewRef.current?.goBack?.();
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate("Chat");
  }, [canWebViewGoBack, navigation]);

  const handleWebMessage = useCallback((event: { nativeEvent?: { data?: string } }) => {
    const rawData = event.nativeEvent?.data;
    if (!rawData) {
      return;
    }

    try {
      const payload = JSON.parse(rawData) as {
        type?: string;
        value?: number;
      };
      if (payload.type === "height" && typeof payload.value === "number") {
        const nextHeight = Math.max(Math.ceil(payload.value), 720);
        setContentHeight((current) => {
          return current === nextHeight ? current : nextHeight;
        });
        clearLoadingMask();
      }
    } catch {
      // Ignore non-JSON messages from the page.
    }
  }, [clearLoadingMask]);

  useEffect(() => {
    if (Platform.OS !== "web" || !shouldRedirectOnWeb) {
      return;
    }
    const redirectTimer = window.setTimeout(() => {
      window.location.assign(uri);
    }, 40);
    return () => window.clearTimeout(redirectTimer);
  }, [shouldRedirectOnWeb, uri]);

  useEffect(() => {
    if (Platform.OS === "web" || !shouldUseAggressiveLoadFallback || !isLoading) {
      return;
    }
    const fallbackTimer = setTimeout(() => {
      setIsLoading(false);
    }, 1800);
    return () => clearTimeout(fallbackTimer);
  }, [isLoading, shouldUseAggressiveLoadFallback]);

  if (Platform.OS === "web") {
    if (shouldRedirectOnWeb) {
      return (
        <SafeAreaView
          edges={["top", "left", "right"]}
          style={[styles.webContainer, { backgroundColor: palette.background }]}
        >
          <View style={styles.webRedirectState}>
            <ActivityIndicator color={palette.foreground} />
            <Text style={[styles.webRedirectTitle, { color: palette.foreground }]}>
              Opening {title}
            </Text>
            <Text
              style={[styles.webRedirectBody, { color: palette.mutedForeground }]}
            >
              Redirecting to the full page...
            </Text>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView
        edges={["top", "left", "right"]}
        style={[styles.webContainer, { backgroundColor: palette.background }]}
      >
        {createWebFrame(uri, title, () => setIsLoading(false), isLoading)}
        {isLoading ? (
          <View style={styles.webLoadingOverlay}>
            <ActivityIndicator color={palette.mutedForeground} />
          </View>
        ) : null}
      </SafeAreaView>
    );
  }

  const WebView =
    require("react-native-webview").WebView as React.ComponentType<any>;

  return (
    <Screen padded={false} style={styles.screen}>
      <View style={styles.content}>
        <PageHeader onBackPress={handleBack} subtitle={subtitle} title={title} />

        {hasError ? (
          <WebRouteErrorState onReload={reload} title={title} />
        ) : (
          <View style={styles.webCard}>
            <WebView
              ref={webViewRef}
              bounces={false}
              domStorageEnabled
              injectedJavaScript={EMBEDDED_NATIVE_PAGE_SCRIPT}
              injectedJavaScriptBeforeContentLoaded={EMBEDDED_NATIVE_PAGE_SCRIPT}
              javaScriptEnabled
              key={reloadKey}
              nestedScrollEnabled={false}
              onError={() => {
                setHasError(true);
                setIsLoading(false);
              }}
              onHttpError={() => {
                setHasError(true);
                setIsLoading(false);
              }}
              onLoad={clearLoadingMask}
              onLoadEnd={() => setIsLoading(false)}
              onLoadProgress={(event: { nativeEvent?: { progress?: number } }) => {
                if ((event.nativeEvent?.progress ?? 0) >= 0.35) {
                  clearLoadingMask();
                }
              }}
              onLoadStart={() => {
                setHasError(false);
                setIsLoading(true);
              }}
              onMessage={handleWebMessage}
              onNavigationStateChange={(state: { canGoBack?: boolean }) => {
                setCanWebViewGoBack(Boolean(state.canGoBack));
              }}
              onShouldStartLoadWithRequest={handleNavigationRequest}
              renderError={() => (
                <WebRouteErrorState onReload={reload} title={title} />
              )}
              scrollEnabled={false}
              sharedCookiesEnabled
              source={nativeSource}
              startInLoadingState={false}
              style={[
                styles.webView,
                { height: Math.max(contentHeight, 720) },
                isLoading && !shouldUseAggressiveLoadFallback
                  ? styles.webViewHidden
                  : null,
              ]}
              thirdPartyCookiesEnabled
            />
            {isLoading ? (
              <View
                style={[
                  styles.loadingMask,
                  { backgroundColor: palette.background },
                ]}
              >
                <WebRouteLoadingMask
                  kind={skeletonKind}
                  palette={palette}
                  title={title}
                />
              </View>
            ) : null}
          </View>
        )}
      </View>
    </Screen>
  );
}

const EMBEDDED_NATIVE_PAGE_SCRIPT = `
  (function () {
    var style = document.createElement('style');
    style.textContent = '[data-page-user-menu="true"],[data-native-back-button="true"]{display:none!important}';
    document.documentElement.appendChild(style);

    var lastHeight = 0;
    var postHeight = function () {
      var body = document.body;
      var doc = document.documentElement;
      if (!body || !doc) return;

      var nextHeight = Math.max(
        body.scrollHeight,
        body.offsetHeight,
        doc.clientHeight,
        doc.scrollHeight,
        doc.offsetHeight
      );

      if (Math.abs(nextHeight - lastHeight) <= 1) return;
      lastHeight = nextHeight;

      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'height', value: nextHeight })
        );
      }
    };

    var queuePostHeight = function () {
      requestAnimationFrame(function () {
        postHeight();
        setTimeout(postHeight, 120);
        setTimeout(postHeight, 400);
        setTimeout(postHeight, 1000);
      });
    };

    window.addEventListener('load', queuePostHeight);
    window.addEventListener('resize', queuePostHeight);
    new MutationObserver(queuePostHeight).observe(document.documentElement, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true
    });

    setInterval(postHeight, 1000);
    queuePostHeight();
  })();
  true;
`;

function WebRouteLoadingMask({
  palette,
  title,
  kind,
}: {
  palette: ReturnType<typeof useAppTheme>["palette"];
  title: string;
  kind: "billing" | "feed" | "forum" | "legal" | "tool";
}) {
  return (
    <View style={styles.loadingContent}>
      <View
        style={[
          styles.loadingTitle,
          {
            backgroundColor: palette.muted,
            width: title.length > 12 ? 180 : 132,
          },
        ]}
      />
      <View
        style={[
          styles.loadingLine,
          { backgroundColor: palette.muted, width: "72%" },
        ]}
      />
      <View
        style={[
          styles.loadingCardBlock,
          { backgroundColor: palette.muted },
          kind === "forum" || kind === "feed" ? styles.loadingCardTall : null,
          kind === "tool" ? styles.loadingCardShort : null,
        ]}
      />
      <View
        style={[
          styles.loadingCardBlock,
          { backgroundColor: palette.muted },
          kind === "legal" || kind === "tool" ? styles.loadingCardShort : null,
        ]}
      />
      {kind !== "legal" && kind !== "tool" ? (
        <View
          style={[styles.loadingCardBlock, { backgroundColor: palette.muted }]}
        />
      ) : null}
      <View style={styles.loadingIndicatorWrap}>
        <ActivityIndicator color={palette.mutedForeground} />
      </View>
    </View>
  );
}

function WebRouteErrorState({
  onReload,
  title,
}: {
  onReload: () => void;
  title: string;
}) {
  const { palette } = useAppTheme();

  return (
    <View style={[styles.errorState, { backgroundColor: palette.background }]}>
      <Text style={[styles.errorTitle, { color: palette.foreground }]}>
        Unable to load {title}
      </Text>
      <Text style={[styles.errorText, { color: palette.mutedForeground }]}>
        Check your connection and try again.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onReload}
        style={[styles.reloadButton, { backgroundColor: palette.primary }]}
      >
        <Text style={[styles.reloadButtonText, { color: palette.primaryForeground }]}>
          Reload
        </Text>
      </Pressable>
    </View>
  );
}

export function createWebRouteScreen(
  path: string,
  title: string,
  routeName?: keyof MainTabParamList
) {
  function WebRouteScreenInstance() {
    return <WebRouteScreen path={path} routeName={routeName} title={title} />;
  }

  WebRouteScreenInstance.displayName = `${title.replace(/\W+/g, "")}Screen`;
  return WebRouteScreenInstance;
}

function createWebFrame(
  uri: string,
  title: string,
  onLoad: () => void,
  isLoading: boolean
) {
  return (
    <View style={styles.webFrameContainer}>
      {React.createElement("iframe", {
        onLoad,
        src: uri,
        style: {
          border: 0,
          flex: 1,
          height: "100%",
          opacity: isLoading ? 0 : 1,
          width: "100%",
        },
        title,
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[8],
  },
  content: {
    gap: spacing[4],
  },
  webContainer: {
    flex: 1,
  },
  webFrameContainer: {
    flex: 1,
  },
  webLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  webRedirectState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[6],
    gap: spacing[2],
  },
  webRedirectTitle: {
    fontSize: typography.subtitle,
    fontWeight: "700",
    textAlign: "center",
  },
  webRedirectBody: {
    fontSize: typography.body,
    lineHeight: 22,
    textAlign: "center",
  },
  webCard: {
    overflow: "hidden",
  },
  webView: {
    width: "100%",
  },
  webViewHidden: {
    opacity: 0,
  },
  loadingMask: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingContent: {
    minHeight: 840,
    paddingHorizontal: spacing[2],
    paddingTop: spacing[2],
    gap: 18,
  },
  loadingTitle: {
    height: 24,
    borderRadius: 12,
    opacity: 0.82,
  },
  loadingLine: {
    height: 16,
    borderRadius: 8,
    opacity: 0.58,
  },
  loadingCardBlock: {
    height: 180,
    borderRadius: 24,
    opacity: 0.34,
  },
  loadingCardTall: {
    height: 260,
  },
  loadingCardShort: {
    height: 120,
  },
  loadingIndicatorWrap: {
    paddingTop: spacing[2],
    alignItems: "center",
    justifyContent: "center",
  },
  errorState: {
    minHeight: 320,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    padding: spacing[6],
  },
  errorTitle: {
    fontSize: typography.body,
    fontWeight: "700",
    textAlign: "center",
  },
  errorText: {
    fontSize: typography.small,
    textAlign: "center",
  },
  reloadButton: {
    minHeight: 42,
    minWidth: 108,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 18,
  },
  reloadButtonText: {
    fontSize: typography.small,
    fontWeight: "700",
  },
});
