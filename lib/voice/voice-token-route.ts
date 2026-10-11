import "server-only";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY, VOICE_CHAT_WEB_FEATURE_FLAG_KEY } from "@/lib/constants";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { isFeatureEnabledForUser } from "@/lib/settings/user-feature-access";
import { getVoiceChatAccessModeForPlatform } from "@/lib/voice/config";
import type { GeminiVoiceTokenResponse } from "@/lib/voice/live";
import { hasEnoughCreditsForLiveVoice, resolveLiveVoiceModelConfig } from "@/lib/voice/live-models";
import { enforceLiveSessionLaunchAccess } from "@/lib/voice/live-session-access";

const schema = z.object({ supportsDurationVoice: z.boolean().optional(), supportsRelayVoice: z.boolean().optional(), modelId: z.string().uuid().optional() }).optional();
export async function handleVoiceToken(request: Request, platform: "web" | "native") {
  const auth = await getAuthenticatedUser(request, { allowBearer: platform === "native" });
  const fail = (status: number, reason: "feature-disabled" | "insufficient-credits" | "platform-unavailable" | "live-api-unavailable" = "live-api-unavailable") => Response.json({ liveSupported: false, reason, message: status === 409 ? "Please update or refresh KhasiGPT to start voice chat." : "KhasiGPT voice chat could not start. Please try again." }, { status, headers: noStoreHeaders() });
  if (!auth?.user) return fail(401);
  const denied = await enforceLiveSessionLaunchAccess(auth.user, { serverMetered: true });
  if (denied) return denied;
  if (!(await incrementRateLimit(`voice-token:${platform}:${auth.user.id}`, { limit: 20, windowMs: 300_000 })).allowed) return fail(429);
  const body = schema.safeParse(await request.json().catch(() => undefined));
  if (!body.success) return fail(400);
  try {
    const [mode, model] = await Promise.all([getVoiceChatAccessModeForPlatform(platform === "web" ? "web" : "android"), resolveLiveVoiceModelConfig({ platform })]);
    if (!model || !await isFeatureEnabledForUser({ featureKey: platform === "web" ? VOICE_CHAT_WEB_FEATURE_FLAG_KEY : VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY, mode, role: auth.user.role, userId: auth.user.id, source: "voice.token" })) return fail(404, "feature-disabled");
    if (!await hasEnoughCreditsForLiveVoice({ userId: auth.user.id })) return fail(402, "insufficient-credits");
    const duration = Boolean(model.durationPricing);
    if (duration ? !body.data?.supportsDurationVoice : !body.data?.supportsRelayVoice) return fail(409, "platform-unavailable");
    const prefix = platform === "web" ? "/api/chat" : "/api/mobile/chat";
    return Response.json({ liveSupported: true, transport: duration ? "webrtc" : "relay", sessionEndpoint: `${prefix}/${duration ? "voice-session" : "voice-relay"}`,
      token: "", liveVoiceModelConfigId: null, modelDisplayName: "", modelProviderModelId: "", voiceName: "", mediaResolution: "", systemInstruction: "", webSocketUrl: "", inputAudioMimeType: "audio/pcm;rate=16000", inputSampleRate: 16000, outputSampleRate: 24000, expireTime: "", newSessionExpireTime: "",
    } satisfies GeminiVoiceTokenResponse, { headers: noStoreHeaders() });
  } catch { return fail(503); }
}
