import { z } from "zod";
import { cookies } from "next/headers";
import { auth } from "@/app/(auth)/auth";
import type { VisibilityType } from "@/components/visibility-selector";
import {
  ALLOWED_IMAGE_MEDIA_TYPES,
  MAX_IMAGE_UPLOAD_BYTES,
  generateNanoBananaImage,
  getImageGenerationAccess,
} from "@/lib/ai/image-generation";
import { IMAGE_GENERATION_FILENAME_PREFIX_SETTING_KEY } from "@/lib/constants";
import {
  deductImageCredits,
  getChatById,
  getAppSetting,
  saveChat,
  saveMessages,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ONE_MINUTE = 60 * 1000;
const IMAGE_RATE_LIMIT = {
  limit: 30,
  windowMs: ONE_MINUTE,
};

const imageRequestSchema = z.object({
  chatId: z.string().uuid(),
  visibility: z.enum(["public", "private"]),
  prompt: z.string().trim().min(1).max(2000),
  userMessageId: z.string().uuid().optional(),
  imageUrl: z.string().url().nullable().optional(),
});

const DEFAULT_IMAGE_FILENAME_PREFIX = "khasigpt-image";

function normalizeImageFilenamePrefix(value: unknown) {
  if (typeof value !== "string") {
    return DEFAULT_IMAGE_FILENAME_PREFIX;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_IMAGE_FILENAME_PREFIX;
  }
  const sanitized = trimmed
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");

  return sanitized || DEFAULT_IMAGE_FILENAME_PREFIX;
}

function detectImageMime(buffer: ArrayBuffer, declaredType?: string | null) {
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
  if (detected) {
    return detected;
  }
  if (declaredType && ALLOWED_IMAGE_MEDIA_TYPES.has(declaredType)) {
    return declaredType;
  }
  return null;
}

function buildFallbackTitle(prompt: string) {
  const normalized = prompt.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "Image generation";
  }
  if (normalized.length <= 80) {
    return normalized;
  }
  return `${normalized.slice(0, 77).trim()}...`;
}

async function enforceImageRateLimit(
  request: Request
): Promise<Response | null> {
  const clientKey = getClientKeyFromHeaders(request.headers);
  const { allowed, resetAt } = await incrementRateLimit(
    `api:image-generation:${clientKey}`,
    IMAGE_RATE_LIMIT
  );

  if (allowed) {
    return null;
  }

  const retryAfterSeconds = Math.max(
    Math.ceil((resetAt - Date.now()) / 1000),
    1
  ).toString();

  return new Response(
    JSON.stringify({
      code: "rate_limit:api",
      message: "Too many image generation requests. Please try again later.",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": retryAfterSeconds,
      },
    }
  );
}

export async function POST(request: Request) {
  const rateLimited = await enforceImageRateLimit(request);
  if (rateLimited) {
    return rateLimited;
  }

  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:auth").toResponse();
  }

  const json = await request.json().catch(() => null);
  const parsed = imageRequestSchema.safeParse(json);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request.";
    return Response.json(
      { code: "bad_request:api", message },
      { status: 400 }
    );
  }
  const payload = parsed.data;

  const access = await getImageGenerationAccess({
    userId: session.user.id,
    userRole: session.user.role,
  });
  if (!access.enabled || !access.model) {
    return new ChatSDKError("forbidden:auth").toResponse();
  }
  if (!access.canGenerate) {
    return new ChatSDKError("payment_required:credits").toResponse();
  }
  if (access.model.provider !== "google") {
    return new ChatSDKError(
      "bad_request:configuration",
      "The selected image model provider is not supported."
    ).toResponse();
  }

  const { chatId, visibility, prompt, imageUrl, userMessageId } = payload;
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const imageFilenamePrefixSetting = await getAppSetting<string>(
    IMAGE_GENERATION_FILENAME_PREFIX_SETTING_KEY
  );
  const imageFilenamePrefix = normalizeImageFilenamePrefix(
    imageFilenamePrefixSetting
  );

  const existingChat = await getChatById({ id: chatId });
  if (existingChat && existingChat.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  if (!existingChat) {
    await saveChat({
      id: chatId,
      userId: session.user.id,
      title: buildFallbackTitle(prompt),
      visibility: visibility as VisibilityType,
    });
  }

  let sourceImage: { data: string; mediaType: string } | undefined;
  let sourceImageType: string | null = null;

  if (imageUrl) {
    try {
      const imageResponse = await fetch(imageUrl, {
        cache: "no-store",
        signal: request.signal,
      });

      if (!imageResponse.ok) {
        return Response.json(
          {
            code: "bad_request:api",
            message: "Unable to fetch the reference image.",
          },
          { status: 400 }
        );
      }

      const buffer = await imageResponse.arrayBuffer();
      if (buffer.byteLength > MAX_IMAGE_UPLOAD_BYTES) {
        return Response.json(
          {
            code: "bad_request:api",
            message: "Images must be 5MB or smaller.",
          },
          { status: 400 }
        );
      }

      const contentType = imageResponse.headers.get("content-type");
      const detected = detectImageMime(buffer, contentType);
      if (!detected) {
        return Response.json(
          {
            code: "bad_request:api",
            message: "Only PNG or JPG images are supported.",
          },
          { status: 400 }
        );
      }

      sourceImageType = detected;
      sourceImage = {
        data: Buffer.from(buffer).toString("base64"),
        mediaType: detected,
      };
    } catch (_error) {
      return Response.json(
        {
          code: "bad_request:api",
          message: "Unable to fetch the reference image.",
        },
        { status: 400 }
      );
    }
  }

  const now = new Date();
  const resolvedUserMessageId = userMessageId ?? generateUUID();
  const assistantMessageId = generateUUID();
  const userParts = [
    ...(imageUrl
      ? [
          {
            type: "file" as const,
            url: imageUrl,
            mediaType: sourceImageType ?? "image/png",
          },
        ]
      : []),
    {
      type: "text" as const,
      text: prompt,
    },
  ];

  try {
    const images = await generateNanoBananaImage({
      prompt,
      image: sourceImage,
      abortSignal: request.signal,
      modelId: access.model.providerModelId,
      preferredLanguage,
    });

    const assistantParts = images.map((image, index) => ({
      type: "file" as const,
      url: `data:${image.mediaType};base64,${image.base64}`,
      mediaType: image.mediaType,
      filename: `${imageFilenamePrefix}-${index + 1}`,
    }));

    await deductImageCredits({
      userId: session.user.id,
      tokensToDeduct: access.tokensPerImage,
      allowManualCredits: session.user.role === "admin",
    });

    await saveMessages({
      messages: [
        {
          chatId,
          id: resolvedUserMessageId,
          role: "user",
          parts: userParts,
          attachments: [],
          createdAt: now,
        },
        {
          chatId,
          id: assistantMessageId,
          role: "assistant",
          parts: assistantParts,
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });

    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      parts: assistantParts,
      metadata: {
        createdAt: new Date().toISOString(),
      },
    };

    return Response.json(
      { assistantMessage },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error("Image generation failed", error);
    return new ChatSDKError("bad_request:api").toResponse();
  }
}
