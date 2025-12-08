import { del, getDownloadUrl, put } from "@vercel/blob";
import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import { getUserById, updateUserImage } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

function shouldDeleteBlob(url: string | null): url is string {
  if (!url) {
    return false;
  }
  return url.startsWith("https://") && url.includes("vercel-storage.com");
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const formData = await request.formData();
  const file = formData.get("image");

  if (!(file instanceof Blob)) {
    return new ChatSDKError(
      "bad_request:api",
      "A valid image file is required."
    ).toResponse();
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return new ChatSDKError(
      "bad_request:api",
      "Profile images must be 2MB or smaller."
    ).toResponse();
  }

  const mimeType = file.type || "image/png";

  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    return new ChatSDKError(
      "bad_request:api",
      "Only PNG, JPG, or WEBP images are supported."
    ).toResponse();
  }

  const extension =
    mimeType === "image/png"
      ? "png"
      : mimeType === "image/webp"
        ? "webp"
        : "jpg";
  const objectKey = `avatars/${session.user.id}/${crypto.randomUUID()}.${extension}`;

  const currentUser = await getUserById(session.user.id);
  const previousImage = currentUser?.image ?? null;

  const blob = await put(objectKey, file, {
    access: "public",
    contentType: mimeType,
    addRandomSuffix: false,
  });

  const updated = await updateUserImage({
    id: session.user.id,
    image: blob.url,
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
      updated?.updatedAt instanceof Date
        ? updated.updatedAt.toISOString()
        : new Date().toISOString(),
  });
}

export async function DELETE() {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const record = await getUserById(session.user.id);
  const updated = await updateUserImage({
    id: session.user.id,
    image: null,
  });

  const imageToDelete = record?.image ?? null;
  if (shouldDeleteBlob(imageToDelete)) {
    del(imageToDelete).catch((error) => {
      console.error("Failed to delete avatar blob", error);
    });
  }

  return NextResponse.json({
    ok: true,
    image: null,
    updatedAt:
      updated?.updatedAt instanceof Date
        ? updated.updatedAt.toISOString()
        : new Date().toISOString(),
  });
}

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const record = await getUserById(session.user.id);
  const imageUrl = record?.image ?? null;
  let signedImage: string | null = null;
  if (imageUrl) {
    try {
      signedImage = getDownloadUrl(imageUrl);
    } catch (_error) {
      signedImage = imageUrl.startsWith("data:") ? imageUrl : null;
    }
  }

  return NextResponse.json({
    image: signedImage,
    updatedAt:
      record?.updatedAt instanceof Date
        ? record.updatedAt.toISOString()
        : (record?.updatedAt ?? null),
  });
}
