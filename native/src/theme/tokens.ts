export type ThemeMode = "light" | "dark";

export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 16,
};

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
};

export const colors = {
  light: {
    background: "#ffffff",
    foreground: "#09090b",
    card: "#ffffff",
    popover: "#ffffff",
    primary: "#18181b",
    primaryForeground: "#fafafa",
    secondary: "#f4f4f5",
    secondaryForeground: "#18181b",
    muted: "#f4f4f5",
    mutedForeground: "#71717a",
    accent: "#f4f4f5",
    border: "#e4e4e7",
    input: "#e4e4e7",
    destructive: "#ef4444",
    destructiveMuted: "#fee2e2",
    success: "#059669",
    warning: "#d97706",
    link: "#18181b",
  },
  dark: {
    background: "#09090b",
    foreground: "#fafafa",
    card: "#09090b",
    popover: "#09090b",
    primary: "#fafafa",
    primaryForeground: "#18181b",
    secondary: "#27272a",
    secondaryForeground: "#fafafa",
    muted: "#27272a",
    mutedForeground: "#a1a1aa",
    accent: "#27272a",
    border: "#27272a",
    input: "#27272a",
    destructive: "#991b1b",
    destructiveMuted: "#450a0a",
    success: "#34d399",
    warning: "#fbbf24",
    link: "#fafafa",
  },
} as const;

export const typography = {
  title: 28,
  subtitle: 21,
  body: 17,
  small: 15,
  tiny: 13,
};
