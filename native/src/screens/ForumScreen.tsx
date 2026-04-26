import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "@/api/client";
import type { ForumThread } from "@/api/types";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { spacing, typography } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";

export function ForumScreen() {
  const { palette } = useAppTheme();
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    api
      .forumThreads()
      .then((overview) => {
        const list =
          Array.isArray((overview as { threads?: unknown }).threads)
            ? (overview as { threads: ForumThread[] }).threads
            : Array.isArray(overview)
              ? (overview as ForumThread[])
              : [];
        setThreads(list);
      })
      .catch(() => setThreads([]));
  }, []);

  return (
    <Screen>
      <Text style={[styles.title, { color: palette.foreground }]}>Forum</Text>
      <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>
        Community discussions use the existing forum API and admin-configured
        access controls.
      </Text>

      <Card>
        <Text style={[styles.cardTitle, { color: palette.foreground }]}>
          Create thread
        </Text>
        <TextField
          label="Title"
          onChangeText={setTitle}
          placeholder="Start a discussion..."
          value={title}
        />
        <TextField
          label="Reply"
          multiline
          onChangeText={setContent}
          placeholder="Write at least 24 characters..."
          style={styles.textarea}
          value={content}
        />
        <Button
          disabled={title.trim().length < 8 || content.trim().length < 24}
          onPress={() =>
            setStatus(
              "Thread creation needs a selected category from the forum overview. This client is wired for the existing POST /api/forum/threads route."
            )
          }
        >
          Create thread
        </Button>
        {status ? (
          <Text style={[styles.meta, { color: palette.mutedForeground }]}>
            {status}
          </Text>
        ) : null}
      </Card>

      {threads.map((thread) => (
        <Card key={thread.id ?? thread.slug}>
          <Text style={[styles.cardTitle, { color: palette.foreground }]}>
            {thread.title}
          </Text>
          <Text style={[styles.meta, { color: palette.mutedForeground }]}>
            {thread.excerpt ?? "Open the web thread for full replies and reactions."}
          </Text>
          <View style={styles.stats}>
            <Text style={[styles.meta, { color: palette.mutedForeground }]}>
              {thread.postCount ?? 0} replies
            </Text>
            <Text style={[styles.meta, { color: palette.mutedForeground }]}>
              {thread.viewCount ?? 0} views
            </Text>
          </View>
        </Card>
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
  meta: {
    fontSize: typography.small,
    lineHeight: 19,
  },
  textarea: {
    minHeight: 110,
    textAlignVertical: "top",
  },
  stats: {
    flexDirection: "row",
    gap: spacing[4],
  },
});
