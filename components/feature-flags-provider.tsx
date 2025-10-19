"use client";

import {
  createContext,
  useContext,
  type PropsWithChildren,
} from "react";

import type { FeatureFlags } from "@/lib/feature-flags";

const FeatureFlagsContext = createContext<FeatureFlags>({
  artifactsEnabled: true,
});

export function FeatureFlagsProvider({
  value,
  children,
}: PropsWithChildren<{ value: FeatureFlags }>) {
  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}
