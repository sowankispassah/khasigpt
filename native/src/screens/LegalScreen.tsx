import * as WebBrowser from "expo-web-browser";
import { StyleSheet, Text } from "react-native";
import { API_BASE_URL } from "@/api/client";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { spacing, typography } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";

const links = [
  { label: "About", path: "/about" },
  { label: "Contact", path: "/about#contact" },
  { label: "Privacy Policy", path: "/privacy-policy" },
  { label: "Terms of Service", path: "/terms-of-service" },
  { label: "Calculator", path: "/calculator" },
];

export function LegalScreen() {
  const { palette } = useAppTheme();
  return (
    <Screen>
      <Text style={[styles.title, { color: palette.foreground }]}>
        Resources
      </Text>
      <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>
        Public and legal pages remain canonical on the existing web app.
      </Text>
      <Card>
        {links.map((link) => (
          <Button
            key={link.path}
            onPress={() => WebBrowser.openBrowserAsync(`${API_BASE_URL}${link.path}`)}
            variant="outline"
          >
            {link.label}
          </Button>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.title,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: typography.body,
    lineHeight: 22,
    marginBottom: spacing[2],
  },
});
