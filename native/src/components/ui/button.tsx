import { ReactNode, useMemo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { useTheme } from "@/theme";
import type { ThemePalette } from "@/theme/colors";

type ButtonVariant = "default" | "outline" | "ghost" | "destructive";
type ButtonSize = "md" | "sm" | "lg";

export type ButtonProps = {
  label: string;
  onPress?: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
};

export function Button({
  label,
  onPress,
  disabled = false,
  loading = false,
  variant = "default",
  size = "md",
  iconLeft,
  iconRight,
}: ButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;

  const variantStyles = useMemo(() => buildVariantStyles(colors), [colors]);
  const sizeStyle = sizeStyles[size];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        sizeStyle,
        (pressed || loading) && styles.pressed,
        isDisabled && styles.disabled,
      ]}
      android_ripple={{ color: colors.muted }}
      onPress={onPress}
    >
      <>
        {iconLeft}
        <Text
          style={[
            styles.label,
            variant === "outline" || variant === "ghost"
              ? { color: colors.foreground }
              : { color: colors.primaryForeground },
          ]}
        >
          {loading ? "..." : label}
        </Text>
        {iconRight}
      </>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    cursor: "pointer",
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
  },
  label: {
    fontFamily: "GeistSemiBold",
    fontSize: 16,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.55,
  },
});

const sizeStyles: Record<ButtonSize, object> = {
  sm: {
    minHeight: 36,
    paddingVertical: 6,
  },
  md: {
    minHeight: 44,
    paddingVertical: 10,
  },
  lg: {
    minHeight: 52,
    paddingVertical: 12,
  },
};

function buildVariantStyles(colors: ThemePalette) {
  return {
    default: {
      backgroundColor: colors.primary,
    },
    outline: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: "transparent",
    },
    ghost: {
      backgroundColor: "transparent",
    },
    destructive: {
      backgroundColor: colors.destructive,
    },
  } as Record<ButtonVariant, object>;
}
