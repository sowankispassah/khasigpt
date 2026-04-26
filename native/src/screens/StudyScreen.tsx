import { StyleSheet, Text } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { spacing, typography } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";

export function StudyScreen() {
  const { bootstrap } = useAuth();
  const { palette } = useAppTheme();
  const prompts = bootstrap?.chat.suggestedPrompts ?? [];

  return (
    <Screen>
      <Text style={[styles.title, { color: palette.foreground }]}>Study</Text>
      <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>
        Study mode stays backend-side. Start study questions from chat with the
        Study tab enabled by admin settings.
      </Text>
      <Card>
        <Text style={[styles.cardTitle, { color: palette.foreground }]}>
          Study chat
        </Text>
        <Text style={[styles.body, { color: palette.mutedForeground }]}>
          Question paper retrieval, quiz state, and RAG context use the existing
          `/api/chat` study mode payload.
        </Text>
      </Card>
      {prompts.slice(0, 3).map((prompt) => (
        <Button key={prompt} variant="outline">
          {prompt}
        </Button>
      ))}
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
  cardTitle: {
    fontSize: typography.subtitle,
    fontWeight: "700",
  },
  body: {
    fontSize: typography.body,
    lineHeight: 22,
  },
});
