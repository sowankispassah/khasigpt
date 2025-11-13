import Feather from "@expo/vector-icons/Feather";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { Button } from "@/components/ui/button";
import { fetchSuggestedPrompts } from "@/services/prompts";
import { useTheme } from "@/theme";

export default function ChatScreen() {
  const { colors } = useTheme();
  const [draft, setDraft] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["suggested-prompts"],
    queryFn: fetchSuggestedPrompts,
  });

  const prompts = useMemo(() => data?.prompts ?? [], [data]);

  const handlePromptPress = (value: string) => {
    setDraft(value);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: 32,
          paddingHorizontal: 20,
          paddingBottom: 160,
          backgroundColor: colors.background,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            paddingVertical: 24,
          }}
        >
          <Text style={{ fontFamily: "GeistSemiBold", fontSize: 24, color: colors.foreground }}>
            Hello there!
          </Text>
          <Text style={{ fontFamily: "Geist", fontSize: 16, color: colors.mutedForeground }}>
            How can I help you today?
          </Text>
        </View>

        <View style={{ gap: 12 }}>
          {isLoading
            ? Array.from({ length: 4 }).map((_, index) => (
                <View
                  key={`skeleton-${index}`}
                  style={{
                    height: 52,
                    borderRadius: 999,
                    backgroundColor: `${colors.muted}55`,
                  }}
                />
              ))
            : prompts.map((prompt) => (
                <Pressable
                  key={prompt}
                  onPress={() => handlePromptPress(prompt)}
                  style={({ pressed }) => ({
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: colors.border,
                    paddingVertical: 14,
                    paddingHorizontal: 20,
                    backgroundColor: pressed ? colors.secondary : colors.card,
                  })}
                >
                  <Text style={{ textAlign: "center", fontFamily: "Geist", color: colors.foreground }}>
                    {prompt}
                  </Text>
                </Pressable>
              ))}
        </View>
      </ScrollView>

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: 20,
          paddingBottom: 32,
          backgroundColor: colors.background,
          gap: 12,
        }}
      >
        <View
          style={{
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            padding: 16,
            gap: 12,
          }}
        >
          <TextInput
            placeholder="Send a message..."
            placeholderTextColor={colors.mutedForeground}
            style={{
              fontFamily: "Geist",
              fontSize: 16,
              color: colors.foreground,
              minHeight: 60,
            }}
            multiline
            value={draft}
            onChangeText={setDraft}
          />

          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Feather color={colors.mutedForeground} name="paperclip" size={20} />
              <Feather color={colors.mutedForeground} name="image" size={20} />
            </View>

            <Button label="Send" disabled={!draft.trim()} onPress={() => void 0} size="sm" />
          </View>
        </View>

        <Text
          style={{
            textAlign: "center",
            fontFamily: "Geist",
            fontSize: 12,
            color: colors.mutedForeground,
          }}
        >
          KhasiGPT or other AI models can make mistakes. Check important details.{"\n"}See privacy policy.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
