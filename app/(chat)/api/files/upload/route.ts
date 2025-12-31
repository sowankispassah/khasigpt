import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/app/(auth)/auth";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png"] as const;

const FileSchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= MAX_FILE_SIZE_BYTES, {
      message: "File size should be less than 5MB",
    })
    .refine(
      (file) =>
        ALLOWED_MIME_TYPES.includes(
          file.type as (typeof ALLOWED_MIME_TYPES)[number]
        ),
      {
        message: "File type should be JPEG or PNG",
      }
    ),
});

function detectImageMime(buffer: ArrayBuffer, declaredType: string) {
  const bytes = new Uint8Array(buffer);
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const isJpeg =
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;

  const detected = isPng ? "image/png" : isJpeg ? "image/jpeg" : null;
  const type =
    detected ??
    (ALLOWED_MIME_TYPES.includes(declaredType as any) ? declaredType : null);

  return type;
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.body === null) {
    return new Response("Request body is empty", { status: 400 });
  }

  try {
    const formData = await request.formData();
    const fileField = formData.get("file");

    if (!(fileField instanceof Blob)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const file = fileField;

    const validatedFile = FileSchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors
        .map((error) => error.message)
        .join(", ");

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const fileBuffer = await file.arrayBuffer();
    const mimeType = detectImageMime(fileBuffer, file.type);

    if (!mimeType) {
      return NextResponse.json(
        { error: "Only valid JPEG or PNG images are allowed" },
        { status: 400 }
      );
    }

    const extension = mimeType === "image/png" ? "png" : "jpg";
    const objectKey = `uploads/${session.user.id}/${crypto.randomUUID()}.${extension}`;

    try {
      const data = await put(objectKey, fileBuffer, {
        access: "public",
        contentType: mimeType,
      });

      return NextResponse.json(data);
    } catch (_error) {
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
