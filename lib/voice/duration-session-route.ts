import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY, VOICE_CHAT_WEB_FEATURE_FLAG_KEY } from "@/lib/constants";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { isFeatureEnabledForUser } from "@/lib/settings/user-feature-access";
import { getVoiceChatAccessModeForPlatform } from "@/lib/voice/config";
import { createDurationVoiceSession } from "@/lib/voice/duration-session";
import { resolveLiveVoiceModelConfig } from "@/lib/voice/live-models";
import { enforceLiveSessionLaunchAccess } from "@/lib/voice/live-session-access";

const schema = z.object({ sdp: z.string().min(10).max(64_000).startsWith("v=0") });

export async function handleDurationSession(request: Request, platform: "web" | "native") {
  const auth = await getAuthenticatedUser(request, { allowBearer: platform === "native" });
  const fail = (status: number) => Response.json({ message: "KhasiGPT voice chat is temporarily unavailable. Please try again.", reason: status === 402 ? "insufficient-credits" : "live-api-unavailable" }, { status, headers: noStoreHeaders() });
  if (!auth?.user) return fail(401);
  const denied = await enforceLiveSessionLaunchAccess(auth.user);
  if (denied) return denied;
  const rate = await incrementRateLimit(`live-session:${auth.user.id}`, { limit: 10, windowMs: 300_000 });
  if (!rate.allowed) return fail(429);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400);
  try {
    const [mode, model] = await Promise.all([getVoiceChatAccessModeForPlatform(platform === "native" ? "android" : "web"), resolveLiveVoiceModelConfig({ platform })]);
    if (!model?.durationPricing || !await isFeatureEnabledForUser({ featureKey: platform === "native" ? VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY : VOICE_CHAT_WEB_FEATURE_FLAG_KEY, mode, role: auth.user.role, userId: auth.user.id, source: "live-session.start" })) return fail(404);
    return Response.json(await createDurationVoiceSession({ model, sdp: parsed.data.sdp, userId: auth.user.id, platform }), { status: 201, headers: noStoreHeaders() });
  } catch (error) {
    const type = error && typeof error === "object" && "type" in error ? error.type : null;
    console.error("[live-session] Creation failed.", { type });
    return fail(type === "payment_required" ? 402 : type === "rate_limit" ? 429 : 503);
  }
}
