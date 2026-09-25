import { ChatSDKError } from "@/lib/errors";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";
import { verifyProductImageToken } from "@/lib/web-search/product-image-token";
import { fetchPublicResource } from "@/lib/web-search/public-fetch";

export const runtime = "nodejs";

const IMAGE_CONTENT_TYPES = [
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export async function GET(request: Request) {
  const rateLimit = await incrementRateLimit(
    `web-search-product-image:${getClientKeyFromHeaders(request.headers)}`,
    { limit: 120, windowMs: 60_000 }
  );
  if (!rateLimit.allowed) {
    return new ChatSDKError("rate_limit:api").toResponse();
  }

  const token = new URL(request.url).searchParams.get("token") ?? "";
  const imageUrl = verifyProductImageToken(token);
  if (!imageUrl) {
    return new ChatSDKError("bad_request:api", "Invalid image request.").toResponse();
  }

  const result = await fetchPublicResource({
    acceptedContentTypes: IMAGE_CONTENT_TYPES,
    maxBytes: 5_000_000,
    timeoutMs: 8000,
    url: imageUrl,
  });
  if (!result) {
    return new ChatSDKError("not_found:api").toResponse();
  }

  return new Response(result.body, {
    headers: {
      "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Type": result.contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
