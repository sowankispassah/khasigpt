import { useCallback, useMemo, useState } from "react";

import { fetchWithErrorHandlers } from "@/lib/utils";

export type CreateThreadPayload = {
  title: string;
  content: string;
  summary?: string;
  categorySlug: string;
  tagSlugs?: string[];
};

export type CreateReplyPayload = {
  content: string;
  parentPostId?: string | null;
};

export type ToggleReactionPayload = {
  postId: string;
  type: "like" | "insightful" | "support";
};

type ForumActionState = {
  isCreatingThread: boolean;
  isCreatingReply: boolean;
  isUpdatingSubscription: boolean;
  isUpdatingThreadStatus: boolean;
  isDeletingThread: boolean;
  busyPostIds: Set<string>;
};

export function useForumActions() {
  const [state, setState] = useState<ForumActionState>({
    isCreatingThread: false,
    isCreatingReply: false,
    isUpdatingSubscription: false,
    busyPostIds: new Set(),
    isUpdatingThreadStatus: false,
    isDeletingThread: false,
  });

  const updateState = useCallback((patch: Partial<ForumActionState>) => {
    setState((prev) => ({
      ...prev,
      ...patch,
    }));
  }, []);

  const createThread = useCallback(
    async (payload: CreateThreadPayload) => {
      updateState({ isCreatingThread: true });
      try {
        const response = await fetchWithErrorHandlers("/api/forum/threads", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        return (await response.json()) as { id: string; slug: string };
      } finally {
        updateState({ isCreatingThread: false });
      }
    },
    [updateState]
  );

  const createReply = useCallback(
    async (threadSlug: string, payload: CreateReplyPayload) => {
      updateState({ isCreatingReply: true });
      try {
        const response = await fetchWithErrorHandlers(
          `/api/forum/threads/${encodeURIComponent(threadSlug)}/posts`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }
        );
        return (await response.json()) as { id: string; threadId: string };
      } finally {
        updateState({ isCreatingReply: false });
      }
    },
    [updateState]
  );

  const toggleSubscription = useCallback(
    async (threadSlug: string, subscribe: boolean) => {
      updateState({ isUpdatingSubscription: true });
      try {
        const response = await fetchWithErrorHandlers(
          `/api/forum/threads/${encodeURIComponent(threadSlug)}/subscribe`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ subscribe }),
          }
        );
        await response.json();
        return subscribe;
      } finally {
        updateState({ isUpdatingSubscription: false });
      }
    },
    [updateState]
  );

  const toggleReaction = useCallback(
    async ({ postId, type }: ToggleReactionPayload) => {
      setState((prev) => {
        const nextIds = new Set(prev.busyPostIds);
        nextIds.add(postId);
        return {
          ...prev,
          busyPostIds: nextIds,
        };
      });

      try {
        const response = await fetchWithErrorHandlers(
          `/api/forum/posts/${encodeURIComponent(postId)}/reactions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ type }),
          }
        );
        return (await response.json()) as { active: boolean };
      } finally {
        setState((prev) => {
          const nextIds = new Set(prev.busyPostIds);
          nextIds.delete(postId);
          return {
            ...prev,
            busyPostIds: nextIds,
          };
        });
      }
    },
    []
  );

  const recordView = useCallback(async (threadSlug: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const blob = new Blob([], { type: "application/json" });
        navigator.sendBeacon(
          `/api/forum/threads/${encodeURIComponent(threadSlug)}/views`,
          blob
        );
        return;
      }

      await fetchWithErrorHandlers(
        `/api/forum/threads/${encodeURIComponent(threadSlug)}/views`,
        {
          method: "POST",
          keepalive: true,
        }
      );
    } catch (error) {
      console.error("[forum] failed to record view", error);
    }
  }, []);

  const updateThreadStatus = useCallback(
    async (threadSlug: string, action: "resolve" | "reopen") => {
      updateState({ isUpdatingThreadStatus: true });
      try {
        const response = await fetchWithErrorHandlers(
          `/api/forum/threads/${encodeURIComponent(threadSlug)}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ action }),
          }
        );
        return (await response.json()) as { status: string };
      } finally {
        updateState({ isUpdatingThreadStatus: false });
      }
    },
    [updateState]
  );

  const deleteThread = useCallback(
    async (threadSlug: string) => {
      updateState({ isDeletingThread: true });
      try {
        await fetchWithErrorHandlers(
          `/api/forum/threads/${encodeURIComponent(threadSlug)}`,
          {
            method: "DELETE",
          }
        );
      } finally {
        updateState({ isDeletingThread: false });
      }
    },
    [updateState]
  );

  const helpers = useMemo(
    () => ({
      isCreatingThread: state.isCreatingThread,
      isCreatingReply: state.isCreatingReply,
      isUpdatingSubscription: state.isUpdatingSubscription,
      isUpdatingThreadStatus: state.isUpdatingThreadStatus,
      isDeletingThread: state.isDeletingThread,
      busyPostIds: state.busyPostIds,
      createThread,
      createReply,
      toggleSubscription,
      toggleReaction,
      recordView,
      updateThreadStatus,
      deleteThread,
    }),
    [
      state.isCreatingThread,
      state.isCreatingReply,
      state.isUpdatingSubscription,
      state.busyPostIds,
      createThread,
      createReply,
      toggleSubscription,
      toggleReaction,
      recordView,
      state.isUpdatingThreadStatus,
      state.isDeletingThread,
      updateThreadStatus,
      deleteThread,
    ]
  );

  return helpers;
}
