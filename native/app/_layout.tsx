import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as SplashScreen from "expo-splash-screen";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ProgressBar } from "@/components/progress-bar";
import { useProtectedRoute } from "@/hooks/use-protected-route";
import { AuthProvider } from "@/providers/auth-provider";
import { QueryProvider } from "@/providers/query-client";

SplashScreen.preventAutoHideAsync().catch(() => {
  // ignore
});

export {
  ErrorBoundary,
} from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Geist: require("../assets/fonts/Geist-Regular.ttf"),
    GeistMedium: require("../assets/fonts/Geist-Medium.ttf"),
    GeistSemiBold: require("../assets/fonts/Geist-SemiBold.ttf"),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync().catch(() => {
        // ignore
      });
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <AuthProvider>
            <ProgressBar />
            <StatusBar style="auto" />
            <ProtectedNavigation />
          </AuthProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ProtectedNavigation() {
  useProtectedRoute();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ presentation: "card" }} />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
