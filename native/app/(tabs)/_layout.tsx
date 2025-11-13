import Feather from "@expo/vector-icons/Feather";
import { Tabs } from "expo-router";
import { View } from "react-native";

import { PersistentUserMenu } from "@/components/user-menu";
import { useTheme } from "@/theme";

export default function TabLayout() {
  const { colors } = useTheme();

  return (
    <>
      <Tabs
        screenOptions={{
          header: () => (
            <View
              style={{
                paddingTop: 8,
                paddingHorizontal: 12,
                paddingBottom: 4,
                backgroundColor: colors.background,
              }}
            >
              <PersistentUserMenu />
            </View>
          ),
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.mutedForeground,
          tabBarStyle: {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: 6,
            paddingTop: 6,
            height: 68,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Chat",
            tabBarIcon: ({ color, size }) => <Feather name="message-circle" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: "History",
            tabBarIcon: ({ color, size }) => <Feather name="clock" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="usage"
          options={{
            title: "Usage",
            tabBarIcon: ({ color, size }) => <Feather name="activity" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Profile",
            tabBarIcon: ({ color, size }) => <Feather name="user" color={color} size={size} />,
          }}
        />
      </Tabs>
    </>
  );
}
