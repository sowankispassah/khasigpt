import { NextResponse } from "next/server";
import { z } from "zod";

import { DOCUMENT_UPLOADS_FEATURE_FLAG_KEY } from "@/lib/constants";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import {
  RequestBodyLimitError,
  readBoundedFormData,
  requestLimitResponse,
} from "@/lib/security/request-body";
import {
  getFeatureAccessModeSettingValue,
  loadFeatureAccessSettingsByKeys,
} from "@/lib/settings/feature-access-settings";
import { isFeatureEnabledForUser } from "@/lib/settings/user-feature-access";
import { extractChatDocument } from "@/lib/uploads/chat-document-parser";
import { buildDocumentDownloadUrl } from "@/lib/uploads/document-access";
import {
  DOCUMENT_EXTENSION_BY_MIME,
  DOCUMENT_MIME_TYPES,
  DOCUMENT_UPLOADS_MAX_BYTES,
  IMAGE_MIME_TYPES,
  parseDocumentUploadsAccessModeSetting,
} from "@/lib/uploads/document-uploads";
import { validateImageBytes } from "@/lib/uploads/image-validation";
import { putPrivateFile } from "@/lib/uploads/private-documents";

const MAX_FILE_SIZE_BYTES = DOCUMENT_UPLOADS_MAX_BYTES;
const ALLOWED_IMAGE_MIME_TYPES = IMAGE_MIME_TYPES;
const UPLOAD_FEATURE_ACCESS_TIMEOUT_MS = 2_000;
const FILE_UPLOAD_RATE_LIMIT = {
  limit: 30,
  windowMs: 10 * 60 * 1000,
};

async function enforceFileUploadRateLimit(userId: string) {
  const { allowed, resetAt } = await incrementRateLimit(
    `file-upload:${userId}`,
    FILE_UPLOAD_RATE_LIMIT,
  );

  if (allowed) {
    return null;
  }

  return NextResponse.json(
    { error: "Too many uploads. Please try again later." },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": Math.max(
          Math.ceil((resetAt - Date.now()) / 1000),
          1,
        ).toString(),
      },
    },
  );
}

export async function POST(request: Request) {
  const session = await getMobileSession(request);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await enforceFileUploadRateLimit(session.user.id);
  if (rateLimited) {
    return rateLimited;
  }

  if (request.body === null) {
    return new Response("Request body is empty", { status: 400 });
  }

  try {
    let formData: FormData;
    try {
      formData = await readBoundedFormData(
        request,
        MAX_FILE_SIZE_BYTES + 16 * 1024,
      );
    } catch (error) {
      if (error instanceof RequestBodyLimitError) return requestLimitResponse();
      return NextResponse.json(
        { error: "Failed to process request" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    if ([...formData.keys()].length !== 1)
      return NextResponse.json(
        { error: "Unsupported file type" },
        { status: 400 },
      );
    const featureAccessSettings = await loadFeatureAccessSettingsByKeys(
      [DOCUMENT_UPLOADS_FEATURE_FLAG_KEY],
      {
        source: "api.files.upload.feature-access",
        timeoutMs: UPLOAD_FEATURE_ACCESS_TIMEOUT_MS,
      },
    );
    const documentUploadsSetting = getFeatureAccessModeSettingValue(
      featureAccessSettings,
      DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
    );
    const documentUploadsMode = parseDocumentUploadsAccessModeSetting(
      documentUploadsSetting,
    );
    const documentUploadsEnabled = await isFeatureEnabledForUser({
      featureKey: DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
      mode: documentUploadsMode,
      role: session.user.role,
      source: "api.files.upload.user-feature-access",
      userId: session.user.id,
    });
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
            ? "File type should be PNG, JPG, PDF, or DOCX"
            : "File type should be PNG or JPG",
        }),
    });

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
    let mimeType: string;
    try {
      mimeType = isImage
        ? await validateImageBytes(Buffer.from(fileBuffer))
        : file.type;
      if (!isImage)
        await extractChatDocument({
          ownerId: session.user.id,
          name: "document",
          buffer: Buffer.from(fileBuffer),
          mediaType: mimeType,
        });
    } catch {
      return NextResponse.json(
        { error: "Failed to process request" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!mimeType) {
      return NextResponse.json(
        { error: "Only valid PNG or JPG images are allowed" },
        { status: 400 },
      );
    }

    const extension = isImage
      ? mimeType === "image/png"
        ? "png"
        : "jpg"
      : DOCUMENT_EXTENSION_BY_MIME[
          mimeType as keyof typeof DOCUMENT_EXTENSION_BY_MIME
        ];

    if (!extension) {
      return NextResponse.json(
        { error: "Unsupported file type" },
        { status: 400 },
      );
    }

    if (process.env.PLAYWRIGHT === "true") {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const url =
        isImage && mimeType === "image/jpeg"
          ? new URL(
              "/images/mouth%20of%20the%20seine%2C%20monet.jpg",
              request.url,
            ).toString()
          : new URL(`/playwright-upload.${extension}`, request.url).toString();
      return NextResponse.json({
        url,
        pathname: `playwright-upload.${extension}`,
        contentType: mimeType,
      });
    }

    const objectKey = `uploads/${session.user.id}/${crypto.randomUUID()}.${extension}`;

    try {
      const data = await putPrivateFile(
        objectKey,
        Buffer.from(fileBuffer),
        mimeType,
      );

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
  } catch (error) {
    if (error instanceof RequestBodyLimitError) return requestLimitResponse();
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
