import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Screen } from "@/components/screen";
import { useAuth } from "@/providers/auth-provider";
import { useTheme } from "@/theme";

export default function CompleteProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useAuth();

  const baseUrl =
    (Constants.expoConfig?.extra as Record<string, string> | undefined)?.webBaseUrl ??
    "https://khasigpt.com";

  const handleOpenWeb = () => {
    WebBrowser.openBrowserAsync(`${baseUrl}/complete-profile`).catch(() => {
      // ignore
    });
  };

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Card>
          <View style={{ gap: 12 }}>
            <Text style={{ fontFamily: "GeistSemiBold", fontSize: 20, color: colors.foreground }}>
              Almost there!
            </Text>
            <Text style={{ fontFamily: "Geist", fontSize: 14, color: colors.mutedForeground }}>
              Confirm your name and date of birth to continue using KhasiGPT. You must be at least 13
              years old.
            </Text>
            <Text style={{ fontFamily: "Geist", fontSize: 14, color: colors.mutedForeground }}>
              {user?.email}
            </Text>
            <Button label="Complete profile on web" onPress={handleOpenWeb} />
            <Button label="Back to chats" variant="outline" onPress={() => router.replace("/")} />
          </View>
        </Card>
      </View>
    </Screen>
  );
}
