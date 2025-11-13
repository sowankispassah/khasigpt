import { LinearGradient } from "expo-linear-gradient";
import { useMemo } from "react";
import { Dimensions, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Card } from "@/components/ui/card";
import { Screen } from "@/components/screen";
import { useTheme } from "@/theme";

const width = Dimensions.get("window").width - 48;
const height = 180;

const mockData = Array.from({ length: 14 }).map((_, i) => ({
  day: i,
  credits: Math.max(0.2, Math.sin(i / 3) + 1.2 + Math.random() * 0.2),
}));

function buildPath(values: typeof mockData) {
  const max = Math.max(...values.map((d) => d.credits));
  const min = Math.min(...values.map((d) => d.credits));
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  return values
    .map((point, index) => {
      const x = index * stepX;
      const y = height - ((point.credits - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export default function UsageScreen() {
  const { colors } = useTheme();
  const path = useMemo(() => buildPath(mockData), []);

  return (
    <Screen scrollable>
      <View style={{ gap: 12, paddingVertical: 12 }}>
        <Text style={{ fontFamily: "GeistSemiBold", fontSize: 20, color: colors.foreground }}>
          Usage & credits
        </Text>
        <Text style={{ fontFamily: "Geist", color: colors.mutedForeground }}>
          Track how many credits you consume each day across chat sessions.
        </Text>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Card>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Geist" }}>Balance</Text>
              <Text style={{ fontFamily: "GeistSemiBold", fontSize: 28 }}>412 credits</Text>
              <Text style={{ color: colors.mutedForeground }}>Renews in 12 days</Text>
            </Card>
          </View>
          <View style={{ flex: 1 }}>
            <Card>
              <Text style={{ color: colors.mutedForeground, fontFamily: "Geist" }}>This week</Text>
              <Text style={{ fontFamily: "GeistSemiBold", fontSize: 28 }}>28 credits</Text>
              <Text style={{ color: colors.mutedForeground }}>-12% vs last week</Text>
            </Card>
          </View>
        </View>

        <Card elevated>
          <Text style={{ fontFamily: "GeistSemiBold", fontSize: 16, marginBottom: 8 }}>
            14-day usage
          </Text>
          <View style={{ height: height + 24 }}>
            <LinearGradient
              style={{ position: "absolute", top: 12, bottom: 12, left: 0, right: 0, borderRadius: 20 }}
              colors={[`${colors.primary}10`, "transparent"]}
            />
            <Svg height={height} width={width}>
              <Path
                d={`${path} L ${width} ${height} L 0 ${height} Z`}
                fill={`${colors.primary}25`}
                stroke="none"
              />
              <Path d={path} stroke={colors.primary} strokeWidth={3} fill="none" strokeLinecap="round" />
            </Svg>
          </View>
        </Card>
      </View>
    </Screen>
  );
}
