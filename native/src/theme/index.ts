import { useColorScheme } from "react-native";

import { darkPalette, lightPalette } from "./colors";

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const colors = isDark ? darkPalette : lightPalette;

  return { colors, isDark };
}

export type AppTheme = ReturnType<typeof useTheme>;
