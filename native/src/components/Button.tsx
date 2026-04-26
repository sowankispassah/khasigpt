import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { radius, spacing, typography } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";

type ButtonVariant = "default" | "outline" | "ghost" | "destructive";

type ButtonProps = {
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: ButtonVariant;
};

export function Button({
  children,
  disabled,
  loading,
  loadingText,
  onPress,
  style,
  variant = "default",
}: ButtonProps) {
  const { palette } = useAppTheme();
  const isDisabled = disabled || loading;
  const backgroundColor =
    variant === "default"
      ? palette.primary
      : variant === "destructive"
        ? palette.destructive
        : variant === "outline"
          ? palette.background
          : "transparent";
  const color =
    variant === "default" || variant === "destructive"
      ? palette.primaryForeground
      : palette.foreground;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor,
          borderColor: palette.input,
          opacity: isDisabled ? 0.55 : pressed ? 0.78 : 1,
        },
        variant === "ghost" ? styles.ghost : null,
        style,
      ]}
    >
      {loading ? (
        <>
          <ActivityIndicator color={color} size="small" />
          {loadingText ? (
            <Text style={[styles.text, { color }]}>{loadingText}</Text>
          ) : null}
        </>
      ) : typeof children === "string" ? (
        <Text style={[styles.text, { color }]}>{children}</Text>
      ) : (
        children
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  ghost: {
    borderColor: "transparent",
  },
  text: {
    fontSize: typography.body,
    fontWeight: "600",
  },
});
