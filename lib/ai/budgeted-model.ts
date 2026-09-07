import type { LanguageModelV2, LanguageModelV2CallOptions } from "@ai-sdk/provider";
import { wrapLanguageModel } from "ai";
import { affordableOutputTokens, type GenerationPricing, inputTokenAllowance } from "@/lib/billing/generation-budget";
import { ChatSDKError } from "@/lib/errors";

async function countGoogleInput(params: LanguageModelV2CallOptions, modelId: string) {
  const system = params.prompt.filter(message => message.role === "system").map(message => message.content).join("\n");
  const contents = params.prompt.filter(message => message.role !== "system").map(message => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: typeof message.content === "string" ? [{ text: message.content }] : message.content.map(part => {
      if (part.type === "text") return { text: part.text };
      if (part.type === "file" && part.data instanceof Uint8Array) return { inlineData: { mimeType: part.mediaType, data: Buffer.from(part.data).toString("base64") } };
      throw new ChatSDKError("bad_request:configuration");
    }),
  }));
  const signal = params.abortSignal ? AbortSignal.any([params.abortSignal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:countTokens`, {
    method: "POST", signal, headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GOOGLE_API_KEY ?? "" },
    body: JSON.stringify({ generateContentRequest: { model: `models/${modelId}`, contents, ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}) } }),
  });
  if (!response.ok) { await response.body?.cancel(); throw new ChatSDKError("bad_request:configuration"); }
  const result = await response.json() as { totalTokens?: number };
  if (!Number.isSafeInteger(result.totalTokens) || (result.totalTokens ?? -1) < 0) throw new ChatSDKError("bad_request:configuration");
  return (result.totalTokens ?? 0) + 1024;
}

export function budgetedModel({ model, provider, modelId, pricing, balance }: {
  model: LanguageModelV2;
  provider: string;
  modelId: string;
  pricing: GenerationPricing;
  balance: () => number;
}) {
  return wrapLanguageModel({ model, middleware: {
    middlewareVersion: "v2",
    transformParams: async ({ params }) => {
      let inputTokens = inputTokenAllowance(params.prompt);
      if (inputTokens === null && provider === "google") inputTokens = await countGoogleInput(params, modelId);
      // OpenAI image processing has bounded tiles/patches; Anthropic downsizes
      // to its visual budget. Reserve 100k tokens/image, above those documented
      // budgets, rather than using compressed file size as a token estimate.
      if (inputTokens === null && (provider === "openai" || provider === "anthropic")) inputTokens = inputTokenAllowance(params.prompt, 100_000);
      if (inputTokens === null) throw new ChatSDKError("bad_request:configuration");
      return { ...params, maxOutputTokens: affordableOutputTokens({ balance: balance(), inputTokens, pricing, requested: params.maxOutputTokens }) };
    },
  } });
}
