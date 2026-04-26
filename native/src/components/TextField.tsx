import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { radius, spacing, typography } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";

type TextFieldProps = TextInputProps & {
  label?: string;
  error?: string | null;
};

export function TextField({ label, error, style, ...props }: TextFieldProps) {
  const { palette } = useAppTheme();
  const isEditable = props.editable !== false;

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={[styles.label, { color: palette.mutedForeground }]}>
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor={palette.mutedForeground}
        style={[
          styles.input,
          {
            backgroundColor: isEditable ? palette.muted : palette.secondary,
            borderColor: error
              ? palette.destructive
              : isEditable
                ? palette.input
                : palette.border,
            borderStyle: isEditable ? "solid" : "dashed",
            color: isEditable ? palette.foreground : palette.mutedForeground,
            opacity: isEditable ? 1 : 0.8,
          },
          style,
        ]}
        {...props}
      />
      {error ? (
        <Text style={[styles.error, { color: palette.destructive }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing[2],
  },
  label: {
    fontSize: typography.small,
  },
  input: {
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontSize: typography.body,
  },
  error: {
    fontSize: typography.small,
  },
});
