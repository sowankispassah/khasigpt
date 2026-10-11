import { getAuthUserById } from "@/lib/db/auth-queries";
import { ChatSDKError } from "@/lib/errors";
import { getAuthenticatedSession } from "@/lib/mobile-auth-session";
import { verifyBlobToken } from "@/lib/security/blob-token";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";
import { resolveDocumentBlobUrl } from "@/lib/uploads/document-access";
import { getPrivateFile, isPrivateImageStorageKey } from "@/lib/uploads/private-documents";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getAuthenticatedSession(request);
  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const limit = await incrementRateLimit(`document-download:${session.user.id}:${getClientKeyFromHeaders(request.headers)}`, { limit: 60, windowMs: 60_000 });
  if (!limit.allowed) return new ChatSDKError("rate_limit:api").toResponse();

  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) {
    return new ChatSDKError("bad_request:api", "Missing download token.").toResponse();
  }

  const payload = verifyBlobToken(token);
  if (!payload) {
    return new ChatSDKError("bad_request:api", "Invalid download token.").toResponse();
  }

  // Recheck active status and role before reading a private object. A stale
  // cookie role must not keep administrative document access after revocation.
  let user: Awaited<ReturnType<typeof getAuthUserById>>;
  try {
    user = await withTimeout(getAuthUserById(session.user.id), 2500);
  } catch {
    return new ChatSDKError("offline:api").toResponse();
  }
  if (!user?.isActive) return new ChatSDKError("unauthorized:api").toResponse();
  const isAdmin = user.role === "admin";
  if (!isAdmin && payload.userId !== session.user.id) {
    return new ChatSDKError("forbidden:api").toResponse();
  }

  const resolved = resolveDocumentBlobUrl({
    sourceUrl: request.url,
    userId: session.user.id,
    baseUrl: request.url,
    isAdmin,
  });

  if (!resolved || resolved.storageKey !== payload.key) {
    return new ChatSDKError("bad_request:api", "Invalid download token.").toResponse();
  }

  let response: Awaited<ReturnType<typeof getPrivateFile>>;
  try {
    response = await getPrivateFile(resolved.storageKey, request.signal);
  } catch {
    return new ChatSDKError("offline:api").toResponse();
  }

  if (!response || response.statusCode !== 200) {
    return new ChatSDKError("not_found:api").toResponse();
  }

  const headers = new Headers();
  headers.set("Content-Type", response.blob.contentType);
  headers.set("Content-Length", String(response.blob.size));
  const image = isPrivateImageStorageKey(resolved.storageKey);
  if (image && !["image/png", "image/jpeg"].includes(response.blob.contentType)) return new ChatSDKError("bad_request:api").toResponse();
  headers.set("Content-Disposition", image ? `inline; filename="${resolved.storageKey.split("/").pop()}"` : response.blob.contentDisposition);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Vary", "Cookie, Authorization");

  return new Response(response.stream, {
    status: 200,
    headers,
  });
}
