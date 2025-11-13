import Feather from "@expo/vector-icons/Feather";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";

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
          paddingHorizontal: 16,
          paddingBottom: 32,
          justifyContent: "center",
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: "100%", gap: 20 }}>
          <View style={{ alignItems: "center", gap: 6, paddingVertical: 16 }}>
            <Text style={{ fontFamily: "GeistSemiBold", fontSize: 22, color: colors.foreground }}>
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
                  <TouchableOpacity
                    key={prompt}
                    activeOpacity={0.8}
                    onPress={() => handlePromptPress(prompt)}
                    style={{
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: colors.border,
                      paddingVertical: 14,
                      paddingHorizontal: 20,
                      backgroundColor: colors.background,
                    }}
                  >
                    <Text style={{ textAlign: "center", fontFamily: "Geist", color: colors.foreground }}>
                      {prompt}
                    </Text>
                  </TouchableOpacity>
                ))}
          </View>

          <View
            style={{
              borderRadius: 24,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.background,
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
                <TouchableOpacity
                  activeOpacity={0.9}
                  disabled={!draft.trim()}
                  onPress={() => void 0}
                  style={{
                    backgroundColor: colors.primary,
                    paddingHorizontal: 24,
                    paddingVertical: 12,
                    borderRadius: 999,
                    opacity: draft.trim() ? 1 : 0.4,
                  }}
                >
                  <Text style={{ color: colors.primaryForeground, fontFamily: "GeistSemiBold" }}>Send</Text>
                </TouchableOpacity>
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
