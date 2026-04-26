import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { SessionPayload } from "@/api/types";
import {
  ensureAvatar,
  getAvatarSnapshot,
  subscribeToAvatarStore,
  updateAvatar,
} from "@/utils/avatar-store";
import { getInitial } from "@/utils/avatar";

export function useUserAvatar(session: SessionPayload) {
  const userId = session?.user.id ?? null;
  const avatarUrl = useSyncExternalStore(
    subscribeToAvatarStore,
    () => getAvatarSnapshot(userId),
    () => null
  );
  const displayName =
    [session?.user.firstName, session?.user.lastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" ")
      .trim() ||
    session?.user.name?.trim() ||
    session?.user.email ||
    "User";

  useEffect(() => {
    if (!userId) {
      return;
    }

    ensureAvatar(userId, Boolean(session?.user.imageVersion)).catch(
      () => undefined
    );
  }, [userId, session?.user.imageVersion]);

  return {
    avatarInitial: getInitial(displayName || session?.user.email),
    avatarUrl,
    displayName,
    refreshAvatar: (nextAvatarUrl?: string | null) => {
      if (!userId) {
        return;
      }

      if (typeof nextAvatarUrl !== "undefined") {
        updateAvatar(userId, nextAvatarUrl);
      }

      ensureAvatar(userId, typeof nextAvatarUrl === "undefined").catch(
        () => undefined
      );
    },
  };
}
