import "server-only";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY, VOICE_CHAT_WEB_FEATURE_FLAG_KEY } from "@/lib/constants";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { isFeatureEnabledForUser } from "@/lib/settings/user-feature-access";
import { getVoiceChatAccessModeForPlatform } from "@/lib/voice/config";
import { createGoogleRelaySession } from "@/lib/voice/google-relay-session";
import { resolveLiveVoiceModelConfig } from "@/lib/voice/live-models";
import { enforceLiveSessionLaunchAccess } from "@/lib/voice/live-session-access";
import { getVoiceRelayRedis, relayInputKey, relayOwnerKey } from "@/lib/voice/relay-redis";

const audio = z.object({ realtimeInput: z.object({ audio: z.object({ data: z.string().max(44000).regex(/^[A-Za-z0-9+/]+={0,2}$/), mimeType: z.literal("audio/pcm;rate=16000") }).strict() }).strict() }).strict();
const end = z.object({ realtimeInput: z.object({ audioStreamEnd: z.literal(true) }).strict() }).strict();
const control = z.object({ sessionId: z.string().uuid(), close: z.boolean().optional(), messages: z.array(z.union([audio, end])).max(8).default([]) }).strict();

export async function handleVoiceRelay(request: Request, platform: "web" | "native") {
  const auth = await getAuthenticatedUser(request, { allowBearer: platform === "native" });
  const fail = (status: number) => Response.json({ message: "KhasiGPT voice chat could not connect. Please try again.", reason: status === 402 ? "insufficient-credits" : "live-api-unavailable" }, { status, headers: noStoreHeaders() });
  if (!auth?.user) return fail(401);
  if (Number(request.headers.get("content-length") ?? 0) > 400000) return fail(413);
  const payload = await request.json().catch(() => null);
  try {
    if (payload?.sessionId) {
      const parsed = control.safeParse(payload);
      if (!parsed.success) return fail(400);
      if (!(await incrementRateLimit(`voice-relay-input:${auth.user.id}`, { limit: 6000, windowMs: 300000 })).allowed) return fail(429);
      const redis = await getVoiceRelayRedis();
      if (await redis.get(relayOwnerKey(parsed.data.sessionId)) !== auth.user.id) return fail(403);
      await redis.xAdd(relayInputKey(parsed.data.sessionId), "*", { body: JSON.stringify(parsed.data) }, { TRIM: { strategy: "MAXLEN", strategyModifier: "~", threshold: 2000 } });
      return Response.json({ accepted: true }, { headers: noStoreHeaders() });
    }
    if (!payload || Object.keys(payload).length) return fail(400);
    const denied = await enforceLiveSessionLaunchAccess(auth.user, { serverMetered: true });
    if (denied) return denied;
    if (!(await incrementRateLimit(`voice-relay-start:${auth.user.id}`, { limit: 10, windowMs: 300000 })).allowed) return fail(429);
    const [mode, model] = await Promise.all([getVoiceChatAccessModeForPlatform(platform === "web" ? "web" : "android"), resolveLiveVoiceModelConfig({ platform })]);
    if (!model || model.provider !== "google" || !await isFeatureEnabledForUser({ featureKey: platform === "web" ? VOICE_CHAT_WEB_FEATURE_FLAG_KEY : VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY, mode, role: auth.user.role, userId: auth.user.id, source: "voice.relay" })) return fail(404);
    const stream = await createGoogleRelaySession(model, auth.user.id, platform, request.signal);
    return new Response(stream, { headers: { ...noStoreHeaders(), "Content-Type": "application/x-ndjson", "X-Accel-Buffering": "no" } });
  } catch (error) {
    const type = error && typeof error === "object" && "type" in error ? error.type : null;
    console.warn("[voice-relay] Request failed.", { type });
    return fail(type === "payment_required" ? 402 : type === "rate_limit" ? 429 : 503);
  }
}
