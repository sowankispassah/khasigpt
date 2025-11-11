import "server-only";

import { z } from "zod";
import {
  ragEntryStatusEnum,
  ragEntryTypeEnum,
} from "@/lib/db/schema";

export const ragEntrySchema = z.object({
  id: z.string().uuid().optional().nullable(),
  title: z.string().min(3).max(160),
  content: z.string().min(16),
  type: z.enum(ragEntryTypeEnum.enumValues),
  status: z.enum(ragEntryStatusEnum.enumValues),
  sourceUrl: z.string().url().optional().nullable(),
  tags: z
    .array(z.string().min(1).max(48))
    .max(24)
    .optional()
    .default([]),
  models: z.array(z.string().uuid()).optional().default([]),
  metadata: z.record(z.unknown()).optional().default({}),
});

export type RagEntrySchemaInput = z.infer<typeof ragEntrySchema>;
