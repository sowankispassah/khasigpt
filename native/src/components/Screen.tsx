import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { spacing } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";

type ScreenProps = {
  children: ReactNode;
  padded?: boolean;
  scroll?: boolean;
  style?: ViewStyle;
};

export function Screen({
  children,
  padded = true,
  scroll = true,
  style,
}: ScreenProps) {
  const { palette } = useAppTheme();
  const content = (
    <View style={[padded ? styles.padded : null, style]}>{children}</View>
  );

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.safe, { backgroundColor: palette.background }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.safe}
      >
        {scroll ? (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {content}
          </ScrollView>
        ) : (
          content
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  padded: {
    padding: spacing[4],
  },
  scrollContent: {
    flexGrow: 1,
  },
});
