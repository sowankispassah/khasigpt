import { del, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  clearActiveUserProfileImage,
  getActiveUserProfileImage,
  setActiveUserProfileImage,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { enforceAvatarUploadLimit } from "@/lib/security/avatar-upload-limit";
import {
  RequestBodyLimitError,
  readBoundedJson,
  requestLimitResponse,
} from "@/lib/security/request-body";
import { validateImageBytes } from "@/lib/uploads/image-validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

const avatarUploadSchema = z.object({
  base64: z
    .string()
    .min(1)
    .max(Math.ceil(MAX_IMAGE_SIZE_BYTES / 3) * 4)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(100),
});

function shouldDeleteBlob(url: string | null): url is string {
  if (!url) {
    return false;
  }
  return url.startsWith("https://") && url.includes("vercel-storage.com");
}

export async function POST(request: Request) {
  const session = await getMobileSession(request);
  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const limited = await enforceAvatarUploadLimit(session.user.id);
  if (limited) return limited;
  let json: unknown;
  try {
    json = await readBoundedJson(
      request,
      Math.ceil(MAX_IMAGE_SIZE_BYTES / 3) * 4 + 4096,
    );
  } catch (error) {
    return error instanceof RequestBodyLimitError
      ? requestLimitResponse()
      : new ChatSDKError("bad_request:api").toResponse();
  }
  const parsed = avatarUploadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.at(0)?.message ?? "Invalid image payload." },
      { status: 400 },
    );
  }

  let mimeType = parsed.data.mimeType;
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: "Only PNG, JPG, or WEBP images are supported." },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(parsed.data.base64, "base64");
  if (bytes.length > MAX_IMAGE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Profile images must be 2MB or smaller." },
      { status: 400 },
    );
  }
  try {
    mimeType = await validateImageBytes(bytes, true);
  } catch {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const extension =
    mimeType === "image/png"
      ? "png"
      : mimeType === "image/webp"
        ? "webp"
        : "jpg";
  const objectKey = `avatars/${session.user.id}/${crypto.randomUUID()}.${extension}`;

  const activeImage = await getActiveUserProfileImage({
    userId: session.user.id,
  });
  const previousImage = activeImage?.imageUrl ?? null;

  const blob = await put(objectKey, bytes, {
    access: "public",
    contentType: mimeType,
    addRandomSuffix: false,
  });

  const updated = await setActiveUserProfileImage({
    userId: session.user.id,
    imageUrl: blob.downloadUrl,
    source: "upload",
  });

  if (shouldDeleteBlob(previousImage)) {
    del(previousImage).catch((error) => {
      console.error("Failed to delete previous avatar blob", error);
    });
  }

  return NextResponse.json({
    ok: true,
    image: blob.downloadUrl,
    updatedAt:
      updated?.record?.createdAt instanceof Date
        ? updated.record.createdAt.toISOString()
        : new Date().toISOString(),
  });
}

export async function DELETE(request: Request) {
  const session = await getMobileSession(request);
  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const activeImage = await getActiveUserProfileImage({
    userId: session.user.id,
  });
  await clearActiveUserProfileImage({ userId: session.user.id });

  const imageToDelete = activeImage?.imageUrl ?? null;
  if (shouldDeleteBlob(imageToDelete)) {
    del(imageToDelete).catch((error) => {
      console.error("Failed to delete avatar blob", error);
    });
  }

  return NextResponse.json({
    ok: true,
    image: null,
    updatedAt:
      activeImage?.createdAt instanceof Date
        ? activeImage.createdAt.toISOString()
        : new Date().toISOString(),
  });
}
