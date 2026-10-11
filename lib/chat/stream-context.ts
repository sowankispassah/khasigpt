import { after } from "next/server";
import { createResumableStreamContext, type ResumableStreamContext } from "resumable-stream";

let globalStreamContext: ResumableStreamContext | null = null;
let streamContextDisabled = false;

const shouldUseRemoteRedis =
  process.env.DISABLE_REMOTE_REDIS === "1"
    ? false
    : process.env.NODE_ENV === "development"
      ? process.env.ENABLE_REMOTE_REDIS_IN_DEV === "1"
      : true;
const rawRedisUrl = shouldUseRemoteRedis
  ? process.env.REDIS_URL ?? process.env.KV_URL ?? null
  : null;
const redisUrl = (() => {
  if (!rawRedisUrl) {
    return null;
  }
  try {
    new URL(rawRedisUrl);
    return rawRedisUrl;
  } catch {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
      console.warn("[chat-stream] Ignoring invalid Redis URL");
    }
    return null;
  }
})();

function hasRedisConnection() {
  return Boolean(redisUrl);
}

export function getStreamContext() {
  if (streamContextDisabled || !hasRedisConnection()) {
    if (!streamContextDisabled) {
      console.log(
        " > Resumable streams are disabled due to missing REDIS_URL/KV_URL"
      );
      streamContextDisabled = true;
    }
    return null;
  }

  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
    } catch (error) {
      console.error(error);
      streamContextDisabled = true;
      globalStreamContext = null;
      return null;
    }
  }

  return globalStreamContext;
}
