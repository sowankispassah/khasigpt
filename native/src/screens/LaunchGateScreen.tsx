import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import type { RootStackParamList } from "@/navigation/types";
import { spacing, typography } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";

type Props = NativeStackScreenProps<RootStackParamList, "LaunchGate">;

export function LaunchGateScreen({ navigation }: Props) {
  const { palette } = useAppTheme();
  const { session } = useAuth();
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<
    "loading" | "ready" | "coming-soon" | "maintenance" | "invite-only" | "offline"
  >("loading");

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const loadSiteStatus = useCallback(() => {
    if (__DEV__) {
      setState("ready");
      return () => undefined;
    }
    let mounted = true;
    clearRetryTimer();
    setState("loading");
    api
      .siteLaunch()
      .then((status) => {
        if (!mounted) {
          return;
        }
        if (status.underMaintenance) {
          setState("maintenance");
          return;
        }
        if (!status.publicLaunched && status.inviteOnlyPrelaunch && !session) {
          setState("invite-only");
          return;
        }
        if (!status.publicLaunched && !session) {
          setState("coming-soon");
          return;
        }
        setState("ready");
      })
      .catch(() => {
        if (mounted) {
          setState("offline");
          retryTimerRef.current = setTimeout(() => {
            loadSiteStatus();
          }, 2500);
        }
      });
    return () => {
      mounted = false;
    };
  }, [clearRetryTimer, session]);

  useEffect(() => loadSiteStatus(), [loadSiteStatus]);
  useEffect(() => clearRetryTimer, [clearRetryTimer]);

  useEffect(() => {
    if (__DEV__) {
      navigation.replace(session?.user ? "Main" : "Auth");
      return;
    }
    if (state !== "ready") {
      return;
    }
    navigation.replace(session?.user ? "Main" : "Auth");
  }, [navigation, session?.user, state]);

  if (state === "loading" || state === "ready") {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={palette.foreground} />
        </View>
      </Screen>
    );
  }

  const copy = {
    "coming-soon": {
      title: "KhasiGPT is coming soon",
      body: "The public launch is not open yet. Check back when the web launch status changes.",
    },
    maintenance: {
      title: "Maintenance in progress",
      body: "KhasiGPT is temporarily unavailable while maintenance is active.",
    },
    "invite-only": {
      title: "Invite-only preview",
      body: "This preview requires invite access. Use the web invite link once, then return to the app.",
    },
    offline: {
      title: "You are offline",
      body: "The app could not reach the KhasiGPT backend. Check your connection or API base URL.",
    },
  }[state];

  return (
    <Screen style={styles.center}>
      <Text style={[styles.title, { color: palette.foreground }]}>
        {copy.title}
      </Text>
      <Text style={[styles.body, { color: palette.mutedForeground }]}>
        {copy.body}
      </Text>
      <Button
        onPress={() => {
          loadSiteStatus();
        }}
        variant="outline"
      >
        Retry
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[4],
  },
  title: {
    fontSize: typography.title,
    fontWeight: "700",
    textAlign: "center",
  },
  body: {
    fontSize: typography.body,
    lineHeight: 22,
    textAlign: "center",
  },
});
