import "server-only";

import { cache } from "react";
import { auth } from "@/app/(auth)/auth";
import { withTimeout } from "@/lib/utils/async";

const CHAT_ROUTE_AUTH_TIMEOUT_MS = 5_000;

function isDynamicServerUsageSignal(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const digest = (error as { digest?: unknown }).digest;
  if (digest === "DYNAMIC_SERVER_USAGE") {
    return true;
  }

  const message = (error as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    message.includes("Dynamic server usage")
  );
}

async function readChatSessionWithTimeout() {
  try {
    return await withTimeout(auth(), CHAT_ROUTE_AUTH_TIMEOUT_MS, () => {
      console.error("[chat/session] Auth lookup timed out.", {
        timeoutMs: CHAT_ROUTE_AUTH_TIMEOUT_MS,
      });
    });
  } catch (error) {
    if (isDynamicServerUsageSignal(error)) {
      throw error;
    }
    console.error("[chat/session] Auth lookup failed.", error);
    return null;
  }
}

export const getChatRouteSession = cache(readChatSessionWithTimeout);

export async function getChatRequestSession() {
  return readChatSessionWithTimeout();
}
