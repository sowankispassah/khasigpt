import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, useWindowDimensions } from "react-native";

import { useIsBusy } from "@/store/progress-store";
import { useTheme } from "@/theme";

export function ProgressBar() {
  const { width: screenWidth } = useWindowDimensions();
  const { colors } = useTheme();
  const isBusy = useIsBusy();
  const progress = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isBusy) {
      opacity.setValue(1);
      Animated.timing(progress, {
        toValue: 0.85,
        duration: 600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(progress, {
        toValue: 1,
        duration: 240,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: false,
      }).start(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }).start(() => {
          progress.setValue(0);
        });
      });
    }
  }, [isBusy, opacity, progress]);

  const animatedStyle = useMemo(
    () => [
      styles.bar,
      {
        width: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.05 * screenWidth, screenWidth],
        }),
        backgroundColor: colors.primary,
        opacity,
      },
    ],
    [colors.primary, opacity, progress, screenWidth]
  );

  return <Animated.View style={animatedStyle} />;
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    pointerEvents: "none",
  } as const,
});
