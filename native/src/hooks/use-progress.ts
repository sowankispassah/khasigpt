import { useCallback } from "react";

import { useProgressStore } from "@/store/progress-store";

export function useProgress() {
  const start = useProgressStore((state) => state.start);
  const stop = useProgressStore((state) => state.stop);

  return useCallback(
    async <T>(task: () => Promise<T>): Promise<T> => {
      const token = start();
      try {
        return await task();
      } finally {
        stop(token);
      }
    },
    [start, stop]
  );
}

export function useProgressHandle() {
  const start = useProgressStore((state) => state.start);
  const stop = useProgressStore((state) => state.stop);

  return useCallback(() => {
    const token = start();
    return () => stop(token);
  }, [start, stop]);
}
