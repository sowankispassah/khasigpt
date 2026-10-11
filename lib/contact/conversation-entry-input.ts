import { z } from "zod";

export const contactConversationEntrySchema = z.object({
  id: z.string().uuid(),
  requestId: z.string().uuid(),
  body: z.string().trim().max(10000),
  kind: z.enum(["public_reply", "internal_note"]).default("public_reply"),
});
