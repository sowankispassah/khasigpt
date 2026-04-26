import { StyleSheet, Text, View } from "react-native";
import { spacing, typography } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";
import { Button } from "./Button";

export function EmptyState({
  actionLabel,
  message,
  onAction,
  title,
}: {
  actionLabel?: string;
  message: string;
  onAction?: () => void;
  title: string;
}) {
  const { palette } = useAppTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: palette.foreground }]}>{title}</Text>
      <Text style={[styles.message, { color: palette.mutedForeground }]}>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Button onPress={onAction} variant="outline">
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: "center",
    gap: spacing[3],
    padding: spacing[6],
  },
  title: {
    fontSize: typography.subtitle,
    fontWeight: "700",
    textAlign: "center",
  },
  message: {
    fontSize: typography.body,
    textAlign: "center",
    lineHeight: 22,
  },
});
