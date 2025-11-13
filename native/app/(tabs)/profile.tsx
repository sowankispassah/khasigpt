import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Screen } from "@/components/screen";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/theme";

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { colors } = useTheme();

  return (
    <Screen scrollable>
      <View style={{ gap: 12, paddingVertical: 12 }}>
        <Text style={{ fontFamily: "GeistSemiBold", fontSize: 20, color: colors.foreground }}>
          Account
        </Text>
        <Text style={{ fontFamily: "Geist", color: colors.mutedForeground }}>
          Manage profile, billing, and device security preferences.
        </Text>

        <Card>
          <Text style={{ fontFamily: "GeistMedium", fontSize: 16 }}>
            {user?.name ?? user?.email ?? "Account"}
          </Text>
          <Text style={{ color: colors.mutedForeground, marginBottom: 12 }}>
            {user?.email ?? "Signed in"}
          </Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Button label="Edit profile" variant="outline" onPress={() => openWeb("/profile")} />
            <Button label="Billing" variant="outline" onPress={() => openWeb("/subscriptions")} />
          </View>
        </Card>

        <Card>
          <Text style={{ fontFamily: "GeistMedium", fontSize: 16 }}>Security</Text>
          <Text style={{ color: colors.mutedForeground, marginBottom: 12 }}>
            Reset your password or revoke device sessions.
          </Text>
          <Button label="Reset password" variant="outline" onPress={() => openWeb("/forgot-password")} />
        </Card>

        <Card>
          <Text style={{ fontFamily: "GeistMedium", fontSize: 16 }}>Sign out</Text>
          <Text style={{ color: colors.mutedForeground, marginBottom: 12 }}>
            You can sign out of the mobile app anytime. We keep your chats synced with web.
          </Text>
          <Button label="Sign out" variant="destructive" onPress={logout} />
        </Card>
      </View>
    </Screen>
  );
}

function openWeb(path: string) {
  const base =
    (Constants.expoConfig?.extra as Record<string, string> | undefined)?.webBaseUrl ??
    "https://khasigpt.com";
  WebBrowser.openBrowserAsync(`${base}${path}`).catch(() => undefined);
}
