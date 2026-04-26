import * as Clipboard from "expo-clipboard";
import { Copy, Mic } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { spacing, typography } from "@/theme/tokens";
import { useAppTheme } from "@/theme/useAppTheme";

export function TranslateScreen() {
  const { bootstrap } = useAuth();
  const { palette } = useAppTheme();
  const languages = bootstrap?.translate.languages ?? [];
  const initialLanguage =
    languages.find((language) => language.code === "en") ??
    languages.find((language) => language.isDefault) ??
    languages[0];
  const [targetLanguageCode, setTargetLanguageCode] = useState(
    initialLanguage?.code ?? ""
  );
  const [sourceText, setSourceText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  const selectedLanguageName = useMemo(
    () =>
      languages.find((language) => language.code === targetLanguageCode)?.name ??
      "Target language",
    [languages, targetLanguageCode]
  );

  const translate = async () => {
    setIsTranslating(true);
    setStatus(null);
    try {
      const result = await api.translateText({
        sourceText,
        targetLanguageCode,
      });
      setTranslatedText(result.translatedText ?? "");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Translation failed.");
    } finally {
      setIsTranslating(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={[styles.title, { color: palette.foreground }]}>
          Translate
        </Text>
        <Text style={[styles.subtitle, { color: palette.mutedForeground }]}>
          Type text and translate through the existing backend models. Live
          speech uses the web flow until native audio streaming is configured.
        </Text>
      </View>

      <View style={styles.languageWrap}>
        {languages.map((language) => (
          <Pressable
            key={language.code}
            onPress={() => setTargetLanguageCode(language.code)}
            style={[
              styles.languageChip,
              {
                backgroundColor:
                  language.code === targetLanguageCode
                    ? palette.foreground
                    : palette.muted,
              },
            ]}
          >
            <Text
              style={{
                color:
                  language.code === targetLanguageCode
                    ? palette.background
                    : palette.foreground,
              }}
            >
              {language.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <TextField
        label="Source text"
        multiline
        onChangeText={setSourceText}
        placeholder="Type or paste text to translate..."
        style={styles.textarea}
        value={sourceText}
      />
      <Button
        disabled={!sourceText.trim() || !targetLanguageCode}
        loading={isTranslating}
        onPress={translate}
      >
        Translate to {selectedLanguageName}
      </Button>

      <Card>
        <View style={styles.resultHeader}>
          <Text style={[styles.resultTitle, { color: palette.foreground }]}>
            Translation
          </Text>
          <Pressable
            disabled={!translatedText}
            onPress={() => Clipboard.setStringAsync(translatedText)}
          >
            <Copy color={palette.mutedForeground} size={18} />
          </Pressable>
        </View>
        <Text style={[styles.result, { color: palette.foreground }]}>
          {translatedText || "Translation appears here."}
        </Text>
      </Card>

      <Card>
        <View style={styles.resultHeader}>
          <Mic color={palette.mutedForeground} size={18} />
          <Text style={[styles.resultTitle, { color: palette.foreground }]}>
            Live translation
          </Text>
        </View>
        <Text style={[styles.result, { color: palette.mutedForeground }]}>
          Native microphone streaming needs platform audio wiring. The mobile
          fallback is text translation for Android now; the web live flow remains
          available from the existing app.
        </Text>
      </Card>

      {status ? (
        <Text style={[styles.status, { color: palette.destructive }]}>
          {status}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  title: {
    fontSize: typography.title,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: typography.body,
    lineHeight: 22,
  },
  languageWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
  },
  languageChip: {
    borderRadius: 6,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  textarea: {
    minHeight: 140,
    textAlignVertical: "top",
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  resultTitle: {
    fontSize: typography.body,
    fontWeight: "700",
  },
  result: {
    fontSize: typography.body,
    lineHeight: 23,
  },
  status: {
    fontSize: typography.small,
  },
});
