import { useEffect } from "react";
import { useRouter, useSegments } from "expo-router";

import { useAuth } from "@/providers/auth-provider";
import { useProgressHandle } from "./use-progress";

export function useProtectedRoute() {
  const segments = useSegments();
  const router = useRouter();
  const { status } = useAuth();
  const trackProgress = useProgressHandle();

  useEffect(() => {
    const inAuthGroup = segments[0] === "(auth)";

    if (status === "unauthenticated" && !inAuthGroup) {
      const stop = trackProgress();
      router.replace("/(auth)/login");
      return () => stop();
    }

    if (status === "authenticated" && inAuthGroup) {
      const stop = trackProgress();
      router.replace("/(tabs)");
      return () => stop();
    }

    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, segments]);
}
