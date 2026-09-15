import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const telemetrySchema = z.object({
  requestId: z.string().uuid(),
  platform: z.enum(["web", "native"]),
  toolRoundTripMs: z.number().int().min(0).max(60_000),
  toolToFirstAudioMs: z.number().int().min(0).max(60_000),
  speechToFirstAudioMs: z.number().int().min(0).max(120_000).nullable(),
  serverTotalMs: z.number().int().min(0).max(60_000),
  retrievalMs: z.number().int().min(0).max(60_000),
});

export async function POST(request: Request) {
  const authContext = await getAuthenticatedUser(request);
  if (!authContext?.user) {
    return new Response(null, { headers: noStoreHeaders(), status: 401 });
  }

  const clientKey = getClientKeyFromHeaders(request.headers);
  const rateLimit = await incrementRateLimit(
    `rag-telemetry:${authContext.user.id}:${clientKey}`,
    { limit: 120, windowMs: 5 * 60 * 1_000 },
  );
  if (!rateLimit.allowed) {
    return new Response(null, { headers: noStoreHeaders(), status: 429 });
  }

  const parsed = telemetrySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return new Response(null, { headers: noStoreHeaders(), status: 400 });
  }

  console.info("[voice/rag] client timing", parsed.data);
  return new Response(null, { headers: noStoreHeaders(), status: 204 });
}
