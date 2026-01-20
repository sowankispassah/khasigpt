import { z } from "zod";
import {
  DOCUMENT_MIME_TYPES,
  IMAGE_MIME_TYPES,
} from "@/lib/uploads/document-uploads";

const ALLOWED_FILE_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  ...DOCUMENT_MIME_TYPES,
] as const;

const textPartSchema = z.object({
  type: z.enum(["text"]),
  text: z.string().min(1).max(2000),
});

const filePartSchema = z.object({
  type: z.enum(["file"]),
  mediaType: z.enum(ALLOWED_FILE_MIME_TYPES),
  name: z.string().min(1).max(100),
  url: z.string().url(),
});

const partSchema = z.union([textPartSchema, filePartSchema]);

export const postRequestBodySchema = z.object({
  id: z.string().uuid(),
  message: z.object({
    id: z.string().uuid(),
    role: z.enum(["user"]),
    parts: z.array(partSchema),
  }),
  hiddenPrompt: z.string().trim().min(1).max(2000).optional(),
  // Historically this cookie stored a model `key` (not the UUID id).
  // Accept both so older clients/cookies don't hard-fail requests.
  selectedChatModel: z.string().min(1).max(128),
  selectedVisibilityType: z.enum(["public", "private"]),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
