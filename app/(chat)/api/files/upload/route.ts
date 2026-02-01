import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/app/(auth)/auth";
import { DOCUMENT_UPLOADS_FEATURE_FLAG_KEY } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import { buildDocumentDownloadUrl } from "@/lib/uploads/document-access";
import {
  DOCUMENT_EXTENSION_BY_MIME,
  DOCUMENT_MIME_TYPES,
  DOCUMENT_UPLOADS_MAX_BYTES,
  IMAGE_MIME_TYPES,
  parseDocumentUploadsEnabledSetting,
} from "@/lib/uploads/document-uploads";

const MAX_FILE_SIZE_BYTES = DOCUMENT_UPLOADS_MAX_BYTES;
const ALLOWED_IMAGE_MIME_TYPES = IMAGE_MIME_TYPES;

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
    (ALLOWED_IMAGE_MIME_TYPES.includes(declaredType as any)
      ? declaredType
      : null);

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
    const documentUploadsSetting = await getAppSetting<string | boolean>(
      DOCUMENT_UPLOADS_FEATURE_FLAG_KEY
    );
    const documentUploadsEnabled = parseDocumentUploadsEnabledSetting(
      documentUploadsSetting
    );
    const allowedMimeTypes = documentUploadsEnabled
      ? [...ALLOWED_IMAGE_MIME_TYPES, ...DOCUMENT_MIME_TYPES]
      : [...ALLOWED_IMAGE_MIME_TYPES];
    const fileSchema = z.object({
      file: z
        .instanceof(Blob)
        .refine((file) => file.size <= MAX_FILE_SIZE_BYTES, {
          message: "File size should be less than 5MB",
        })
        .refine((file) => allowedMimeTypes.includes(file.type as any), {
          message: documentUploadsEnabled
            ? "File type should be PNG, JPG, PDF, DOCX, or XLSX"
            : "File type should be PNG or JPG",
        }),
    });

    const formData = await request.formData();
    const fileField = formData.get("file");

    if (!(fileField instanceof Blob)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const file = fileField;

    const validatedFile = fileSchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors
        .map((error) => error.message)
        .join(", ");

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const fileBuffer = await file.arrayBuffer();
    const isImage = ALLOWED_IMAGE_MIME_TYPES.includes(file.type as any);
    const mimeType = isImage ? detectImageMime(fileBuffer, file.type) : file.type;

    if (!mimeType) {
      return NextResponse.json(
        { error: "Only valid PNG or JPG images are allowed" },
        { status: 400 }
      );
    }

    const extension = isImage
      ? mimeType === "image/png"
        ? "png"
        : "jpg"
      : DOCUMENT_EXTENSION_BY_MIME[mimeType as keyof typeof DOCUMENT_EXTENSION_BY_MIME];

    if (!extension) {
      return NextResponse.json(
        { error: "Unsupported file type" },
        { status: 400 }
      );
    }
    const objectKey = `uploads/${session.user.id}/${crypto.randomUUID()}.${extension}`;

    try {
      const data = await put(objectKey, fileBuffer, {
        access: "public",
        contentType: mimeType,
      });

      if (isImage) {
        return NextResponse.json(data);
      }

      const downloadUrl = buildDocumentDownloadUrl({
        blobUrl: data.url,
        userId: session.user.id,
        baseUrl: request.url,
      });

      if (!downloadUrl) {
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
      }

      return NextResponse.json({
        url: downloadUrl,
        pathname: data.pathname,
        contentType: data.contentType ?? mimeType,
      });
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
