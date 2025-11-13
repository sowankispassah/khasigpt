import { nanoid } from "nanoid/non-secure";
import { create } from "zustand";

type ProgressState = {
  actions: Record<string, number>;
  start: () => string;
  stop: (token: string) => void;
  reset: () => void;
};

export const useProgressStore = create<ProgressState>((set) => ({
  actions: {},
  start: () => {
    const token = nanoid();
    set((state) => ({
      actions: { ...state.actions, [token]: Date.now() },
    }));
    return token;
  },
  stop: (token: string) =>
    set((state) => {
      const next = { ...state.actions };
      delete next[token];
      return { actions: next };
    }),
  reset: () => set({ actions: {} }),
}));

export function useIsBusy() {
  return useProgressStore((state) => Object.keys(state.actions).length > 0);
}
