import type { LanguageModelV2 } from "@ai-sdk/provider";
import { wrapLanguageModel } from "ai";
import { ChatSDKError } from "@/lib/errors";
import {
  CHAT_MAX_ATTACHMENTS,
  CHAT_MAX_CONTEXT_TEXT_BYTES,
} from "@/lib/security/chat-limits";

// This wraps free and paid generation, including auxiliary calls on this model.
// The paid wallet wrapper remains inside it and can reduce the ceiling further.
export function boundedChatModel(
  model: LanguageModelV2,
  maxOutputTokens: number,
) {
  return wrapLanguageModel({
    model,
    middleware: {
      middlewareVersion: "v2",
      transformParams: async ({ params }) => {
        let textBytes = 0;
        let files = 0;
        if (params.prompt.length > 128)
          throw new ChatSDKError("bad_request:api");
        for (const message of params.prompt) {
          if (typeof message.content === "string")
            textBytes += Buffer.byteLength(message.content, "utf8");
          else
            for (const part of message.content) {
              if (part.type === "file") {
                files++;
                continue;
              }
              textBytes += Buffer.byteLength(JSON.stringify(part), "utf8");
            }
          if (
            textBytes > CHAT_MAX_CONTEXT_TEXT_BYTES ||
            files > CHAT_MAX_ATTACHMENTS
          )
            throw new ChatSDKError("bad_request:api");
        }
        const requested = params.maxOutputTokens ?? maxOutputTokens;
        if (!Number.isSafeInteger(requested) || requested < 1)
          throw new ChatSDKError("bad_request:api");
        return {
          ...params,
          maxOutputTokens: Math.min(requested, maxOutputTokens),
        };
      },
    },
  });
}
