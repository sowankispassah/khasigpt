import "react-native-gesture-handler";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { AuthStack } from "@/navigation/AuthStack";
import { MainTabs } from "@/navigation/MainTabs";
import type { RootStackParamList } from "@/navigation/types";
import { JobDetailsScreen } from "@/screens/JobDetailsScreen";
import { LaunchGateScreen } from "@/screens/LaunchGateScreen";
import { AppThemeProvider, useAppTheme } from "@/theme/useAppTheme";

const Stack = createNativeStackNavigator<RootStackParamList>();

function RootNavigator() {
  const { bootstrap, isLoading, session } = useAuth();
  const { mode, palette } = useAppTheme();

  if (!__DEV__ && isLoading && !bootstrap) {
    return (
      <View style={[styles.center, { backgroundColor: palette.background }]}>
        <ActivityIndicator color={palette.foreground} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen component={LaunchGateScreen} name="LaunchGate" />
          {session?.user ? (
            <>
              <Stack.Screen component={MainTabs} name="Main" />
              <Stack.Screen component={JobDetailsScreen} name="JobDetails" />
            </>
          ) : (
            <Stack.Screen component={AuthStack} name="Auth" />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppThemeProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </AppThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
