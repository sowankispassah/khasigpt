import Feather from "@expo/vector-icons/Feather";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";

import { Card } from "@/components/ui/card";
import { Screen } from "@/components/screen";
import { useTheme } from "@/theme";

dayjs.extend(relativeTime);

const mockChats = Array.from({ length: 12 }).map((_, index) => ({
  id: `chat-${index}`,
  title: index % 2 === 0 ? "Khasi translation" : "Research summary",
  createdAt: dayjs().subtract(index * 3, "hour").toISOString(),
  credits: Math.random() * 2 + 0.2,
}));

export default function HistoryScreen() {
  const { colors } = useTheme();
  const grouped = useMemo(() => {
    const buckets: Record<string, typeof mockChats> = {};
    for (const chat of mockChats) {
      const key = dayjs(chat.createdAt).format("MMMM DD");
      buckets[key] = [...(buckets[key] ?? []), chat];
    }
    return buckets;
  }, []);

  return (
    <Screen scrollable>
      <View style={{ gap: 12, paddingVertical: 12 }}>
            <Text style={{ fontFamily: "GeistSemiBold", fontSize: 20, color: colors.foreground }}>
          Conversation history
        </Text>
        <Text style={{ fontFamily: "Geist", color: colors.mutedForeground }}>
          Swipe through recent prompts and resume where you left off.
        </Text>

        <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 64 }}>
          {Object.entries(grouped).map(([date, chats]) => (
            <View key={date} style={{ gap: 8 }}>
              <Text style={{ fontFamily: "GeistMedium", color: colors.mutedForeground }}>
                {date}
              </Text>
              <View style={{ gap: 12 }}>
                {chats.map((chat) => (
                  <Card key={chat.id}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text style={{ fontFamily: "GeistSemiBold", fontSize: 16 }}>
                          {chat.title}
                        </Text>
                        <Text style={{ fontFamily: "Geist", color: colors.mutedForeground }}>
                          {dayjs(chat.createdAt).fromNow()} · {chat.credits.toFixed(2)} credits
                        </Text>
                      </View>
                      <Feather color={colors.mutedForeground} name="chevron-right" size={20} />
                    </View>
                  </Card>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </Screen>
  );
}
