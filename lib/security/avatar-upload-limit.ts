import { incrementRateLimit } from "@/lib/security/rate-limit";

export async function enforceAvatarUploadLimit(userId: string) {
  const result = await incrementRateLimit(`avatar-upload:${userId}`, {
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (result.allowed) return null;
  return Response.json(
    {
      code: result.reason === "unavailable" ? "offline:api" : "rate_limit:api",
    },
    {
      status: result.reason === "unavailable" ? 503 : 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(
          Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000)),
        ),
      },
    },
  );
}
