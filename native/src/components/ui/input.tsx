import { forwardRef } from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";

import { useTheme } from "@/theme";

type InputProps = TextInputProps & {
  label?: string;
  error?: string | null;
};

export const Input = forwardRef<TextInput, InputProps>(
  ({ label, error, style, ...rest }, ref) => {
    const { colors } = useTheme();
    return (
      <View style={styles.container}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.mutedForeground}
          style={[
            styles.input,
            {
              borderColor: error ? colors.destructive : colors.border,
              backgroundColor: colors.card,
              color: colors.foreground,
            },
            style,
          ]}
          {...rest}
        />
        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
      </View>
    );
  }
);

Input.displayName = "Input";

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  label: {
    fontFamily: "GeistMedium",
    marginBottom: 6,
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: "Geist",
    fontSize: 16,
    cursor: "text",
  },
  error: {
    fontFamily: "Geist",
    fontSize: 12,
    marginTop: 4,
  },
});
