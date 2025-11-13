import { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/theme";

type ScreenProps = PropsWithChildren<{
  scrollable?: boolean;
  padded?: boolean;
}>;

export function Screen({ children, scrollable = false, padded = true }: ScreenProps) {
  const { colors } = useTheme();
  const content = (
    <View
      style={[
        styles.content,
        padded && styles.padded,
      ]}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {scrollable ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>{content}</ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  scrollContent: {
    flexGrow: 1,
  },
});
