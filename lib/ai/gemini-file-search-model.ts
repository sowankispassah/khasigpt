import "server-only";

import type {
  JSONValue,
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2Prompt,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
  SharedV2ProviderMetadata,
} from "@ai-sdk/provider";
import { ChatSDKError } from "@/lib/errors";
import { getGeminiApiKey } from "@/lib/rag/gemini-file-search";

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const FILE_SEARCH_SYSTEM_INSTRUCTION =
  "You have access to a File Search store containing optional custom knowledge. Use file_search only when it improves correctness (e.g., questions about our product, policies, internal docs, or other curated content). If retrieved content is irrelevant or does not contain the needed information, ignore it and answer normally. Never invent facts; if you are unsure, say you don't know.";

function toJsonValue(value: unknown): JSONValue {
  if (value === undefined) {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(value)) as JSONValue;
  } catch {
    return null;
  }
}

type GeminiRequest = {
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: Array<{ role?: string; parts: Array<Record<string, unknown>> }>;
  generationConfig?: Record<string, unknown>;
  tools?: Array<Record<string, unknown>>;
};

type GeminiTextBlock = { type: "text" | "reasoning"; text: string };

function getModelPath(modelId: string) {
  return modelId.includes("/") ? modelId : `models/${modelId}`;
}

function normalizeHeaders(
  headers: LanguageModelV2CallOptions["headers"]
): Record<string, string> {
  if (!headers) {
    return {};
  }
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string" && value.length > 0) {
      output[key] = value;
    }
  }
  return output;
}

function toBase64(data: Uint8Array | string): string {
  if (typeof data === "string") {
    return data;
  }
  return Buffer.from(data).toString("base64");
}

function convertPromptToGemini({
  prompt,
}: {
  prompt: LanguageModelV2Prompt;
}): Pick<GeminiRequest, "systemInstruction" | "contents"> {
  const systemParts: Array<{ text: string }> = [];
  const contents: GeminiRequest["contents"] = [];

  let systemMessagesAllowed = true;

  for (const { role, content } of prompt) {
    switch (role) {
      case "system": {
        if (!systemMessagesAllowed) {
          throw new ChatSDKError(
            "bad_request:api",
            "System messages are only supported at the beginning of the conversation."
          );
        }
        systemParts.push({ text: content });
        break;
      }
      case "user": {
        systemMessagesAllowed = false;
        const parts: Array<Record<string, unknown>> = [];
        for (const part of content) {
          if (part.type === "text") {
            parts.push({ text: part.text });
          } else if (part.type === "file") {
            const mimeType =
              part.mediaType === "image/*" ? "image/jpeg" : part.mediaType;
            if (part.data instanceof URL) {
              parts.push({
                fileData: { mimeType, fileUri: part.data.toString() },
              });
            } else {
              const raw =
                typeof part.data === "string"
                  ? part.data
                  : toBase64(part.data);
              parts.push({
                inlineData: { mimeType, data: raw },
              });
            }
          }
        }
        contents.push({ role: "user", parts });
        break;
      }
      case "assistant": {
        systemMessagesAllowed = false;
        const parts: Array<Record<string, unknown>> = [];
        for (const part of content) {
          if (part.type === "text") {
            if (part.text.length > 0) {
              parts.push({ text: part.text });
            }
          } else if (part.type === "reasoning") {
            if (part.text.length > 0) {
              parts.push({ text: part.text, thought: true });
            }
          } else if (part.type === "file") {
            if (part.data instanceof URL) {
              throw new ChatSDKError(
                "bad_request:api",
                "Assistant file URLs are not supported for Gemini requests."
              );
            }
            const mimeType = part.mediaType;
            parts.push({
              inlineData: {
                mimeType,
                data: typeof part.data === "string" ? part.data : toBase64(part.data),
              },
            });
          } else if (part.type === "tool-call") {
            parts.push({
              functionCall: {
                name: part.toolName,
                args: part.input,
              },
            });
          }
        }
        contents.push({ role: "model", parts });
        break;
      }
      case "tool": {
        systemMessagesAllowed = false;
        const parts: Array<Record<string, unknown>> = [];
        for (const part of content) {
          const output = part.output;
          if (output.type === "content") {
            for (const outputPart of output.value) {
              if (outputPart.type === "text") {
                parts.push({
                  functionResponse: {
                    name: part.toolName,
                    response: {
                      name: part.toolName,
                      content: outputPart.text,
                    },
                  },
                });
              } else if (outputPart.type === "media") {
                parts.push(
                  {
                    inlineData: {
                      mimeType: outputPart.mediaType,
                      data: outputPart.data,
                    },
                  },
                  { text: "Tool executed successfully and returned an image." }
                );
              } else {
                parts.push({ text: JSON.stringify(outputPart) });
              }
            }
          } else {
            parts.push({
              functionResponse: {
                name: part.toolName,
                response: {
                  name: part.toolName,
                  content: output.value,
                },
              },
            });
          }
        }
        contents.push({ role: "user", parts });
        break;
      }
    }
  }

  return {
    systemInstruction:
      systemParts.length > 0 ? { parts: systemParts } : undefined,
    contents,
  };
}

function addFileSearchSystemInstruction(
  systemInstruction: GeminiRequest["systemInstruction"]
): GeminiRequest["systemInstruction"] {
  if (systemInstruction?.parts?.length) {
    return { parts: [{ text: FILE_SEARCH_SYSTEM_INSTRUCTION }, ...systemInstruction.parts] };
  }
  return { parts: [{ text: FILE_SEARCH_SYSTEM_INSTRUCTION }] };
}

function mapGeminiFinishReason(
  finishReason: string | undefined
): LanguageModelV2FinishReason {
  switch (finishReason) {
    case "STOP":
      return "stop";
    case "MAX_TOKENS":
      return "length";
    case "IMAGE_SAFETY":
    case "RECITATION":
    case "SAFETY":
    case "BLOCKLIST":
    case "PROHIBITED_CONTENT":
    case "SPII":
      return "content-filter";
    case "FINISH_REASON_UNSPECIFIED":
    case "OTHER":
      return "other";
    case "MALFORMED_FUNCTION_CALL":
      return "error";
    default:
      return "unknown";
  }
}

function buildFileSearchTools({
  storeName,
  metadataFilter,
}: {
  storeName: string;
  metadataFilter?: string | null;
}): GeminiRequest["tools"] {
  return [
    {
      file_search: {
        file_search_store_names: [storeName],
        ...(metadataFilter?.trim()
          ? { metadataFilter: metadataFilter.trim() }
          : {}),
      },
    },
  ];
}

function buildGenerationConfig(options: LanguageModelV2CallOptions) {
  const config: Record<string, unknown> = {};

  if (typeof options.maxOutputTokens === "number") {
    config.maxOutputTokens = options.maxOutputTokens;
  }
  if (typeof options.temperature === "number") {
    config.temperature = options.temperature;
  }
  if (typeof options.topP === "number") {
    config.topP = options.topP;
  }
  if (typeof options.topK === "number") {
    config.topK = options.topK;
  }
  if (Array.isArray(options.stopSequences) && options.stopSequences.length > 0) {
    config.stopSequences = options.stopSequences;
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

export function createGeminiFileSearchLanguageModel({
  modelId,
  storeName,
  metadataFilter,
}: {
  modelId: string;
  storeName: string;
  metadataFilter?: string | null;
}): LanguageModelV2 {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new ChatSDKError(
      "bad_request:configuration",
      "Missing GEMINI_API_KEY / GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY."
    );
  }

  return {
    specificationVersion: "v2",
    provider: "google.gemini-file-search",
    modelId,
    supportedUrls: {
      "*": [
        /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/files\/.*$/i,
        /^https:\/\/(?:www\.)?youtube\.com\/watch\?v=[\w-]+(?:&[\w=&.-]*)?$/i,
        /^https:\/\/youtu\.be\/[\w-]+(?:\?[\w=&.-]*)?$/i,
      ],
    },
    async doGenerate(options: LanguageModelV2CallOptions) {
      const { contents, systemInstruction } = convertPromptToGemini({
        prompt: options.prompt,
      });

      const generationConfig = buildGenerationConfig(options);
      const body: GeminiRequest = {
        contents,
        systemInstruction: addFileSearchSystemInstruction(systemInstruction),
        ...(generationConfig ? { generationConfig } : {}),
        tools: buildFileSearchTools({ storeName, metadataFilter }),
      };

      const response = await fetch(
        `${GEMINI_API_BASE_URL}/${getModelPath(modelId)}:generateContent`,
        {
          method: "POST",
          headers: {
            "x-goog-api-key": apiKey,
            "Content-Type": "application/json",
            ...normalizeHeaders(options.headers),
          },
          body: JSON.stringify(body),
          signal: options.abortSignal,
        }
      );

      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        throw new ChatSDKError(
          "bad_request:api",
          `Gemini generateContent failed (${response.status}): ${text}`
        );
      }

      const rawResponse = (await response.json().catch(() => null)) as any;
      const candidate = rawResponse?.candidates?.[0] ?? null;
      const candidateContent = candidate?.content?.parts ?? [];

      const content: LanguageModelV2Content[] = [];
      for (const part of candidateContent) {
        if (typeof part?.text === "string" && part.text.length > 0) {
          content.push({
            type: part.thought === true ? "reasoning" : "text",
            text: part.text,
          });
        }
      }

      const usageMetadata = rawResponse?.usageMetadata;
      const usage: LanguageModelV2Usage = {
        inputTokens: usageMetadata?.promptTokenCount,
        outputTokens: usageMetadata?.candidatesTokenCount,
        totalTokens: usageMetadata?.totalTokenCount,
        reasoningTokens: usageMetadata?.thoughtsTokenCount,
        cachedInputTokens: usageMetadata?.cachedContentTokenCount,
      };

      const providerMetadata: SharedV2ProviderMetadata = {
        google: {
          promptFeedback: toJsonValue(rawResponse?.promptFeedback),
          groundingMetadata:
            toJsonValue(candidate?.groundingMetadata ?? candidate?.grounding_metadata),
          urlContextMetadata: toJsonValue(candidate?.urlContextMetadata),
          safetyRatings: toJsonValue(candidate?.safetyRatings),
          usageMetadata: toJsonValue(usageMetadata),
        },
      };

      return {
        content,
        finishReason: mapGeminiFinishReason(candidate?.finishReason),
        usage,
        warnings: [],
        providerMetadata,
        request: { body },
        response: {
          headers: Object.fromEntries(response.headers.entries()),
          body: rawResponse,
        },
      };
    },
    async doStream(options: LanguageModelV2CallOptions) {
      const { contents, systemInstruction } = convertPromptToGemini({
        prompt: options.prompt,
      });

      const generationConfig = buildGenerationConfig(options);
      const body: GeminiRequest = {
        contents,
        systemInstruction: addFileSearchSystemInstruction(systemInstruction),
        ...(generationConfig ? { generationConfig } : {}),
        tools: buildFileSearchTools({ storeName, metadataFilter }),
      };

      // `streamGenerateContent` has inconsistent support for File Search grounding
      // across model/endpoint combinations. To ensure File Search is applied, we
      // call `generateContent` and emit a synthetic stream.
      const response = await fetch(
        `${GEMINI_API_BASE_URL}/${getModelPath(modelId)}:generateContent`,
        {
          method: "POST",
          headers: {
            "x-goog-api-key": apiKey,
            "Content-Type": "application/json",
            ...normalizeHeaders(options.headers),
          },
          body: JSON.stringify(body),
          signal: options.abortSignal,
        }
      );

      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        throw new ChatSDKError(
          "bad_request:api",
          `Gemini generateContent failed (${response.status}): ${text}`
        );
      }

      const rawResponse = (await response.json().catch(() => null)) as any;
      const candidate = rawResponse?.candidates?.[0] ?? null;
      const candidateContent = candidate?.content?.parts ?? [];

      const finishReason: LanguageModelV2FinishReason = mapGeminiFinishReason(
        candidate?.finishReason
      );
      const usage: LanguageModelV2Usage = {
        inputTokens: rawResponse?.usageMetadata?.promptTokenCount,
        outputTokens: rawResponse?.usageMetadata?.candidatesTokenCount,
        totalTokens: rawResponse?.usageMetadata?.totalTokenCount,
        reasoningTokens: rawResponse?.usageMetadata?.thoughtsTokenCount,
        cachedInputTokens: rawResponse?.usageMetadata?.cachedContentTokenCount,
      };
      const providerMetadata: SharedV2ProviderMetadata = {
        google: {
          promptFeedback: toJsonValue(rawResponse?.promptFeedback),
          groundingMetadata: toJsonValue(
            candidate?.groundingMetadata ?? candidate?.grounding_metadata
          ),
          urlContextMetadata: toJsonValue(candidate?.urlContextMetadata),
          safetyRatings: toJsonValue(candidate?.safetyRatings),
          usageMetadata: toJsonValue(rawResponse?.usageMetadata),
        },
      };

      const contentBlocks: GeminiTextBlock[] = [];
      for (const part of candidateContent) {
        if (typeof part?.text === "string" && part.text.length > 0) {
          contentBlocks.push({
            type: part.thought === true ? "reasoning" : "text",
            text: part.text,
          });
        }
      }

      let currentTextBlockId: string | null = null;
      let currentReasoningBlockId: string | null = null;
      let blockCounter = 0;

      const stream = new ReadableStream<LanguageModelV2StreamPart>({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });

          const flushBlocks = () => {
            if (currentTextBlockId !== null) {
              controller.enqueue({ type: "text-end", id: currentTextBlockId });
              currentTextBlockId = null;
            }
            if (currentReasoningBlockId !== null) {
              controller.enqueue({
                type: "reasoning-end",
                id: currentReasoningBlockId,
              });
              currentReasoningBlockId = null;
            }
          };

          for (const block of contentBlocks) {
            if (block.type === "reasoning") {
              if (currentTextBlockId !== null) {
                controller.enqueue({ type: "text-end", id: currentTextBlockId });
                currentTextBlockId = null;
              }
              if (currentReasoningBlockId === null) {
                currentReasoningBlockId = String(blockCounter++);
                controller.enqueue({
                  type: "reasoning-start",
                  id: currentReasoningBlockId,
                });
              }
              controller.enqueue({
                type: "reasoning-delta",
                id: currentReasoningBlockId,
                delta: block.text,
              });
            } else {
              if (currentReasoningBlockId !== null) {
                controller.enqueue({
                  type: "reasoning-end",
                  id: currentReasoningBlockId,
                });
                currentReasoningBlockId = null;
              }
              if (currentTextBlockId === null) {
                currentTextBlockId = String(blockCounter++);
                controller.enqueue({ type: "text-start", id: currentTextBlockId });
              }
              controller.enqueue({
                type: "text-delta",
                id: currentTextBlockId,
                delta: block.text,
              });
            }
          }

          flushBlocks();

          controller.enqueue({
            type: "finish",
            finishReason,
            usage,
            providerMetadata,
          });
          controller.close();
        },
      });

      return {
        stream,
        request: { body },
        response: {
          headers: Object.fromEntries(response.headers.entries()),
          body: rawResponse,
        },
      };
    },
  };
}
