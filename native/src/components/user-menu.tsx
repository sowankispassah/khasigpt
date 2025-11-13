import Feather from "@expo/vector-icons/Feather";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/theme";
import { useProgressHandle } from "@/hooks/use-progress";

const WEB_BASE_URL =
  (Constants.expoConfig?.extra as Record<string, string> | undefined)?.webBaseUrl ??
  "https://khasigpt.com";

export function PersistentUserMenu() {
  const { user, status, logout } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();
  const trackProgress = useProgressHandle();
  const [open, setOpen] = useState(false);

  const initials = useMemo(() => {
    if (!user) {
      return null;
    }
    const source = user.firstName || user.name || user.email;
    return source
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join("");
  }, [user]);

  const handleNavigate = (path: string) => {
    const stop = trackProgress();
    setOpen(false);
    router.push(path);
    stop();
  };

  const handleSignOut = async () => {
    setOpen(false);
    await logout();
    router.replace("/(auth)/login");
  };

  const handleOpenForum = async () => {
    setOpen(false);
    await WebBrowser.openBrowserAsync(`${WEB_BASE_URL}/forum`);
  };

  const triggerContent =
    status === "loading" ? (
      <ActivityIndicator color={colors.primary} size="small" />
    ) : user ? (
      <Text style={{ color: colors.primaryForeground, fontFamily: "GeistSemiBold" }}>
        {initials ?? "You"}
      </Text>
    ) : (
      <Feather color={colors.foreground} name="more-vertical" size={18} />
    );

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={[
          styles.trigger,
          { borderColor: colors.border, backgroundColor: colors.card },
          status === "loading" && { opacity: 0.7 },
        ]}
      >
        {triggerContent}
      </Pressable>

      <Modal animationType="fade" transparent visible={open} onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ fontFamily: "GeistSemiBold", fontSize: 16, marginBottom: 12 }}>
              {user?.email ?? "Guest"}
            </Text>

            <MenuItem icon="message-circle" label="Chat" onPress={() => handleNavigate("/")} />
            <MenuItem icon="clock" label="History" onPress={() => handleNavigate("/history")} />
            <MenuItem icon="activity" label="Usage & Billing" onPress={() => handleNavigate("/usage")} />
            <MenuItem icon="user" label="Profile" onPress={() => handleNavigate("/profile")} />
            <MenuItem icon="globe" label="Open forum" onPress={handleOpenForum} />

            {user ? (
              <MenuItem
                destructive
                icon="log-out"
                label="Sign out"
                onPress={handleSignOut}
              />
            ) : null}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function MenuItem({
  label,
  icon,
  destructive = false,
  onPress,
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  destructive?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        {
          borderColor: colors.border,
          backgroundColor: pressed ? colors.secondary : "transparent",
        },
      ]}
    >
      <Feather color={destructive ? colors.destructive : colors.foreground} name={icon} size={18} />
      <Text
        style={{
          fontFamily: "GeistMedium",
          color: destructive ? colors.destructive : colors.foreground,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.2)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    padding: 16,
  },
  menu: {
    width: 220,
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    cursor: "pointer",
  },
});
