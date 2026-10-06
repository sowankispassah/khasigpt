import "server-only";
import { createClient } from "redis";

let client: ReturnType<typeof createClient> | undefined;
let connecting: Promise<unknown> | undefined;
export async function getVoiceRelayRedis() {
  if (!client) {
    const url = process.env.REDIS_URL ?? process.env.KV_URL;
    if (!url || !/^rediss?:\/\//.test(url)) throw new Error("Voice relay storage unavailable");
    client = createClient({ url, socket: { connectTimeout: 3000, reconnectStrategy: false } });
    client.on("error", () => console.warn("[voice-relay] Shared transport unavailable."));
  }
  if (!client.isOpen) {
    connecting ??= client.connect().finally(() => { connecting = undefined; });
    await connecting;
  }
  return client;
}
export const relayOwnerKey = (id: string) => `voice-relay:owner:${id}`;
export const relayInputKey = (id: string) => `voice-relay:input:${id}`;
