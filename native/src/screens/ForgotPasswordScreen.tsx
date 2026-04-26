import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as WebBrowser from "expo-web-browser";
import { StyleSheet, Text } from "react-native";
import { API_BASE_URL } from "@/api/client";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import type { AuthStackParamList } from "@/navigation/types";
import { spacing, typography } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";

type Props = NativeStackScreenProps<AuthStackParamList, "ForgotPassword">;

export function ForgotPasswordScreen({ navigation }: Props) {
  const { palette } = useAppTheme();
  return (
    <Screen style={styles.wrap}>
      <Text style={[styles.title, { color: palette.foreground }]}>
        Reset your password
      </Text>
      <Text style={[styles.body, { color: palette.mutedForeground }]}>
        Password reset uses the existing web email flow so the same verification,
        token expiry, and account rules apply.
      </Text>
      <Button
        onPress={() => WebBrowser.openBrowserAsync(`${API_BASE_URL}/forgot-password`)}
      >
        Open reset page
      </Button>
      <Button onPress={() => navigation.goBack()} variant="ghost">
        Back to sign in
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
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
