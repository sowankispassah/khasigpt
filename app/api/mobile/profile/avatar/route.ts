import { del, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  clearActiveUserProfileImage,
  getActiveUserProfileImage,
  setActiveUserProfileImage,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

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
  base64: z.string().min(1),
  fileName: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
});

function shouldDeleteBlob(url: string | null): url is string {
  if (!url) {
    return false;
  }
  return url.startsWith("https://") && url.includes("vercel-storage.com");
}

function detectExtension(fileName: string, mimeType: string) {
  const normalizedName = fileName.toLowerCase();
  if (normalizedName.endsWith(".png") || mimeType === "image/png") {
    return "png";
  }
  if (normalizedName.endsWith(".webp") || mimeType === "image/webp") {
    return "webp";
  }
  return "jpg";
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const parsed = avatarUploadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.at(0)?.message ?? "Invalid image payload." },
      { status: 400 }
    );
  }

  const mimeType = parsed.data.mimeType || "image/jpeg";
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: "Only PNG, JPG, or WEBP images are supported." },
      { status: 400 }
    );
  }

  const bytes = Buffer.from(parsed.data.base64, "base64");
  if (bytes.length > MAX_IMAGE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Profile images must be 2MB or smaller." },
      { status: 400 }
    );
  }

  const extension = detectExtension(parsed.data.fileName, mimeType);
  const objectKey = `avatars/${session.user.id}/${crypto.randomUUID()}.${extension}`;

  const activeImage = await getActiveUserProfileImage({ userId: session.user.id });
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

export async function DELETE() {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const activeImage = await getActiveUserProfileImage({ userId: session.user.id });
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
