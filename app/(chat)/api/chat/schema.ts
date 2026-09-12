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

const studyQuestionReferencePartSchema = z.object({
  type: z.enum(["data-studyQuestionReference"]),
  data: z.object({
    paperId: z.string().uuid(),
    title: z.string().trim().min(1).max(180),
    preview: z.string().trim().min(1).max(320),
  }),
});

const jobTitleReferencePartSchema = z.object({
  type: z.enum(["data-jobTitleReference"]),
  data: z.object({
    title: z.string().trim().min(1).max(180),
    preview: z.string().trim().min(1).max(320),
  }),
});

const newsInitialPartSchema = z.object({
  type: z.enum(["data-newsInitial"]),
  data: z.object({
    hidden: z.literal(true),
  }),
});

const partSchema = z.union([
  textPartSchema,
  filePartSchema,
  studyQuestionReferencePartSchema,
  jobTitleReferencePartSchema,
  newsInitialPartSchema,
]);

export const postRequestBodySchema = z.object({
  id: z.string().uuid(),
  message: z.object({
    id: z.string().uuid(),
    role: z.enum(["user"]),
    parts: z.array(partSchema),
  }),
  hiddenPrompt: z.string().trim().min(1).max(2000).optional(),
  chatMode: z.enum(["default", "study", "jobs", "news"]).optional(),
  studyPaperId: z.string().uuid().optional().nullable(),
  studyQuizActive: z.boolean().optional(),
  jobPostingId: z.string().uuid().optional().nullable(),
  originJobPostingId: z.string().uuid().optional().nullable(),
  // Legacy clients may still send a model value. The chat route ignores it and
  // always uses the admin-configured default model for user-facing chats.
  selectedChatModel: z
    .preprocess(
      (value) =>
        typeof value === "string" && !value.trim() ? undefined : value,
      z.string().min(1).max(128).optional()
    ),
  selectedLanguage: z.string().trim().min(1).max(16).optional(),
  selectedVisibilityType: z.enum(["public", "private"]),
  toolIntent: z
    .enum(["normal_chat", "web_search", "other_tool"])
    .optional(),
  toolIntentToken: z.string().min(1).max(4000).optional(),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
