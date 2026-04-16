import type { LanguageModelV2 } from "@ai-sdk/provider";
import { simulateReadableStream } from "ai";
import { getResponseChunksByPrompt } from "@/tests/prompts/utils";

function extractPromptText(prompt: unknown) {
  if (!Array.isArray(prompt)) {
    return "";
  }
  const last = prompt.at(-1) as { content?: unknown } | undefined;
  if (!Array.isArray(last?.content)) {
    return "";
  }
  return last.content
    .map((part) =>
      part && typeof part === "object" && "text" in part
        ? String((part as { text?: unknown }).text ?? "")
        : ""
    )
    .join(" ")
    .trim();
}

function buildTitle(prompt: unknown) {
  const text = extractPromptText(prompt);
  if (!text) {
    return "This is a test title";
  }
  return text.split(/\s+/).slice(0, 8).join(" ");
}

function createTestModel({
  modelId,
  reasoning = false,
  title = false,
}: {
  modelId: string;
  reasoning?: boolean;
  title?: boolean;
}): LanguageModelV2 {
  return {
    specificationVersion: "v2",
    provider: "playwright",
    modelId,
    supportedUrls: {
      "image/*": [/^https?:\/\/localhost(?::\d+)?\//],
    },
    doGenerate: async ({ prompt }) => ({
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      content: [
        {
          type: "text",
          text: title ? buildTitle(prompt) : "Hello, world!",
        },
      ],
      warnings: [],
    }),
    doStream: async ({ prompt }) => ({
      stream: simulateReadableStream({
        chunkDelayInMs: title ? 100 : 500,
        initialDelayInMs: title ? 100 : 1000,
        chunks: title
          ? [
              { id: "1", type: "text-start" },
              { id: "1", type: "text-delta", delta: "This is a test title" },
              { id: "1", type: "text-end" },
              {
                type: "finish",
                finishReason: "stop",
                usage: { inputTokens: 3, outputTokens: 10, totalTokens: 13 },
              },
            ]
          : getResponseChunksByPrompt(prompt, reasoning),
      }),
    }),
  };
}

export const chatModel = createTestModel({ modelId: "chat-model" });
export const reasoningModel = createTestModel({
  modelId: "chat-model-reasoning",
  reasoning: true,
});
export const titleModel = createTestModel({
  modelId: "title-model",
  title: true,
});
export const artifactModel = createTestModel({ modelId: "artifact-model" });
