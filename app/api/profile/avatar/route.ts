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

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const updated = await updateUserImage({
    id: session.user.id,
    image: dataUrl,
  });

  return NextResponse.json({
    ok: true,
    image: dataUrl,
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

  const updated = await updateUserImage({
    id: session.user.id,
    image: null,
  });

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

  return NextResponse.json({
    image: record?.image ?? null,
    updatedAt:
      record?.updatedAt instanceof Date
        ? record.updatedAt.toISOString()
        : (record?.updatedAt ?? null),
  });
}
