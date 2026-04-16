import { auth } from "@/app/(auth)/auth";
import { ChatSDKError } from "@/lib/errors";
import { verifyBlobToken } from "@/lib/security/blob-token";
import { resolveDocumentBlobUrl } from "@/lib/uploads/document-access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) {
    return new ChatSDKError("bad_request:api", "Missing download token.").toResponse();
  }

  const payload = verifyBlobToken(token);
  if (!payload) {
    return new ChatSDKError("bad_request:api", "Invalid download token.").toResponse();
  }

  const isAdmin = session.user.role === "admin";
  if (!isAdmin && payload.userId !== session.user.id) {
    return new ChatSDKError("forbidden:api").toResponse();
  }

  const resolved = resolveDocumentBlobUrl({
    sourceUrl: payload.url,
    userId: payload.userId,
    baseUrl: request.url,
    isAdmin,
  });

  if (!resolved || resolved.storageKey !== payload.key) {
    return new ChatSDKError("bad_request:api", "Invalid download token.").toResponse();
  }

  const response = await fetch(resolved.blobUrl, {
    cache: "no-store",
    signal: request.signal,
  });

  if (!response.ok || !response.body) {
    return new ChatSDKError("not_found:api").toResponse();
  }

  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  if (contentType) {
    headers.set("Content-Type", contentType);
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }
  const contentDisposition = response.headers.get("content-disposition");
  if (contentDisposition) {
    headers.set("Content-Disposition", contentDisposition);
  }
  headers.set("Cache-Control", "private, max-age=60");

  return new Response(response.body, {
    status: 200,
    headers,
  });
}
