import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2StreamPart,
} from "@ai-sdk/provider";
import { expect, test } from "@playwright/test";
import { generateText, streamText } from "ai";
import { boundedChatModel } from "@/lib/ai/bounded-chat-model";
import { budgetedModel } from "@/lib/ai/budgeted-model";
import {
  abortedInputTokenEstimate,
  observeDispatchedInput,
  resolveAbortedGenerationUsage,
} from "@/lib/billing/abort-billing";
import { estimateTokenCountFromText } from "@/lib/billing/cost-plus";
import {
  affordableOutputTokens,
  type GenerationPricing,
  inputTokenAllowance,
} from "@/lib/billing/generation-budget";

const pricing: GenerationPricing = {
  providerKey: "openai",
  inputCostPerMillionUsd: 1,
  outputCostPerMillionUsd: 10,
  markupMultiplier: 4,
  usdToInr: 100,
  walletUnitsPerInr: 100,
  pricingReferencePlanId: "fixture",
};
const balance = 1000;
const messages = [
  { role: "user" as const, content: "Explain the monsoon in Shillong." },
];

type Seen = { params: LanguageModelV2CallOptions };

// Streams reasoning and text, then either finishes with provider usage or
// waits for the client to abort mid-step.
function streamingModel(seen: Seen[], finish: boolean): LanguageModelV2 {
  return {
    specificationVersion: "v2",
    provider: "fixture",
    modelId: "fixture",
    supportedUrls: {},
    doGenerate: async (params) => {
      seen.push({ params });
      return {
        content: [{ type: "text", text: "ok" }],
        finishReason: "stop",
        usage: { inputTokens: 7, outputTokens: 1, totalTokens: 8 },
        warnings: [],
      };
    },
    doStream: async (params) => {
      seen.push({ params });
      return {
        stream: new ReadableStream<LanguageModelV2StreamPart>({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            controller.enqueue({ type: "reasoning-start", id: "r" });
            controller.enqueue({
              type: "reasoning-delta",
              id: "r",
              delta: "Thinking about rainfall",
            });
            controller.enqueue({ type: "reasoning-end", id: "r" });
            controller.enqueue({ type: "text-start", id: "t" });
            controller.enqueue({
              type: "text-delta",
              id: "t",
              delta: "Shillong gets heavy rain",
            });
            if (finish) {
              controller.enqueue({ type: "text-end", id: "t" });
              controller.enqueue({
                type: "finish",
                finishReason: "stop",
                usage: { inputTokens: 1234, outputTokens: 56, totalTokens: 1290 },
              });
              controller.close();
              return;
            }
            params.abortSignal?.addEventListener(
              "abort",
              () =>
                controller.error(
                  Object.assign(new Error("aborted"), { name: "AbortError" })
                ),
              { once: true }
            );
          },
        }),
      };
    },
  };
}

// Mirrors the route: the observer sits inside the wallet admission wrapper.
function paidChatModel(provider: LanguageModelV2, onDispatch: (estimate: () => number) => void) {
  return boundedChatModel(
    budgetedModel({
      model: observeDispatchedInput(provider, onDispatch),
      provider: "openai",
      modelId: "fixture",
      pricing,
      balance: () => balance,
    }),
    4096
  );
}

test("a paid stream aborted before any step finishes is charged its estimated input plus streamed reasoning and text", async () => {
  const seen: Seen[] = [];
  let admittedInputEstimate: (() => number) | null = null;
  let streamedText = "";
  let streamedReasoning = "";
  let resolveText: () => void = () => undefined;
  const textArrived = new Promise<void>((resolve) => {
    resolveText = resolve;
  });
  const controller = new AbortController();
  const result = streamText({
    model: paidChatModel(streamingModel(seen, false), (estimate) => {
      admittedInputEstimate = estimate;
    }),
    system: "Internal system prompt",
    messages,
    maxRetries: 0,
    abortSignal: controller.signal,
    onChunk: ({ chunk }) => {
      if (chunk.type === "text-delta") {
        streamedText += chunk.text;
        resolveText();
      } else if (chunk.type === "reasoning-delta") {
        streamedReasoning += chunk.text;
      }
    },
  });
  const usage = result.usage;
  usage.catch(() => undefined);
  await textArrived;
  controller.abort();

  // The SDK reports no usage for an unfinished step; this is what left
  // aborted paid generations unbilled.
  await expect(usage).rejects.toMatchObject({
    name: "AI_NoOutputGeneratedError",
  });
  expect(seen).toHaveLength(1);
  expect(admittedInputEstimate).not.toBeNull();

  const decision = resolveAbortedGenerationUsage({
    admittedInputEstimate,
    fallbackInputTokens: 1,
    paid: true,
    providerUsage: null,
    streamedReasoning,
    streamedText,
  });
  const admitted = inputTokenAllowance(seen[0].params.prompt);
  // The observer leaves admission untouched: the provider received the output
  // ceiling computed from admission's own allowance.
  expect(seen[0].params.maxOutputTokens).toBe(
    affordableOutputTokens({
      balance,
      inputTokens: admitted ?? -1,
      pricing,
      requested: 4096,
    })
  );
  const outputTokens =
    estimateTokenCountFromText("Shillong gets heavy rain") +
    estimateTokenCountFromText("Thinking about rainfall");
  // The charge is the fair estimate of what the provider received, not
  // admission's upper bound.
  const charged = abortedInputTokenEstimate(seen[0].params.prompt);
  expect(charged).toBeLessThan(admitted ?? 0);
  expect(decision).toEqual({
    source: "estimate",
    usage: {
      inputTokens: charged,
      outputTokens,
      totalTokens: charged + outputTokens,
    },
  });
});

test("an abort after the provider reported step usage keeps that usage", () => {
  const providerUsage = { inputTokens: 900, outputTokens: 40, totalTokens: 940 };
  let estimated = false;
  expect(
    resolveAbortedGenerationUsage({
      admittedInputEstimate: () => {
        estimated = true;
        return 5000;
      },
      fallbackInputTokens: 10,
      paid: true,
      providerUsage,
      streamedReasoning: "reasoning",
      streamedText: "text",
    })
  ).toEqual({ source: "provider", usage: providerUsage });
  expect(estimated).toBe(false);
});

test("free and never-dispatched aborts keep the earlier text-only estimate", () => {
  const free = resolveAbortedGenerationUsage({
    admittedInputEstimate: null,
    fallbackInputTokens: 50,
    paid: false,
    providerUsage: null,
    streamedReasoning: "long hidden reasoning that free users never paid for",
    streamedText: "  partial  ",
  });
  expect(free).toEqual({
    source: "estimate",
    usage: { inputTokens: 50, outputTokens: 2, totalTokens: 52 },
  });
  for (const paid of [false, true]) {
    expect(
      resolveAbortedGenerationUsage({
        admittedInputEstimate: null,
        fallbackInputTokens: 50,
        paid,
        providerUsage: null,
        streamedReasoning: "reasoning",
        streamedText: "   ",
      })
    ).toBeNull();
  }
  // An admission estimate never bills a free request.
  expect(
    resolveAbortedGenerationUsage({
      admittedInputEstimate: () => 5000,
      fallbackInputTokens: 0,
      paid: false,
      providerUsage: null,
      streamedReasoning: "",
      streamedText: "",
    })
  ).toBeNull();
  // A paid request that reached the provider is charged even with no output.
  expect(
    resolveAbortedGenerationUsage({
      admittedInputEstimate: () => 3000,
      fallbackInputTokens: 0,
      paid: true,
      providerUsage: null,
      streamedReasoning: "",
      streamedText: "",
    })
  ).toEqual({
    source: "estimate",
    usage: { inputTokens: 3000, outputTokens: 0, totalTokens: 3000 },
  });
});

test("a finished stream keeps provider usage and identical provider requests", async () => {
  const observed: Seen[] = [];
  const plain: Seen[] = [];
  let dispatches = 0;
  const run = (model: LanguageModelV2) =>
    streamText({ model, system: "Internal system prompt", messages, maxRetries: 0 });
  const withObserver = run(
    paidChatModel(streamingModel(observed, true), () => {
      dispatches += 1;
    })
  );
  const withoutObserver = run(
    boundedChatModel(
      budgetedModel({
        model: streamingModel(plain, true),
        provider: "openai",
        modelId: "fixture",
        pricing,
        balance: () => balance,
      }),
      4096
    )
  );
  expect(await withObserver.text).toBe("Shillong gets heavy rain");
  expect(await withObserver.usage).toMatchObject({
    inputTokens: 1234,
    outputTokens: 56,
  });
  await withoutObserver.consumeStream();
  expect(observed[0].params.maxOutputTokens).toBe(plain[0].params.maxOutputTokens);
  expect(observed[0].params.prompt).toEqual(plain[0].params.prompt);
  expect(dispatches).toBe(1);

  // Auxiliary non-streamed calls on the paid model are not marked as the chat stream.
  await generateText({
    model: paidChatModel(streamingModel([], true), () => {
      dispatches += 1;
    }),
    prompt: "title",
    maxRetries: 0,
  });
  expect(dispatches).toBe(1);
});

test("the input estimate counts UTF-8 text, message overhead and a typical image cost", () => {
  const english = "What is in this photo?";
  const devanagari = "शिलांग में बारिश";
  const prompt: LanguageModelV2CallOptions["prompt"] = [
    { role: "system", content: english },
    {
      role: "user",
      content: [
        { type: "text", text: devanagari },
        { type: "file", mediaType: "image/png", data: new Uint8Array([1, 2, 3]) },
        { type: "file", mediaType: "application/pdf", data: new Uint8Array([1]) },
      ],
    },
  ];
  expect(abortedInputTokenEstimate(prompt)).toBe(
    4 + Math.ceil(Buffer.byteLength(english, "utf8") / 4) +
      4 + Math.ceil(Buffer.byteLength(devanagari, "utf8") / 4) + 1600
  );
  // Non-Latin text is charged by bytes, not by its shorter character count.
  expect(Math.ceil(Buffer.byteLength(devanagari, "utf8") / 4)).toBeGreaterThan(
    estimateTokenCountFromText(devanagari)
  );
  // Far below admission's deliberate upper bound for the text alone.
  expect(abortedInputTokenEstimate(prompt.slice(0, 1))).toBeLessThan(
    inputTokenAllowance(prompt.slice(0, 1)) ?? 0
  );
});

test("the abort charge and the normal charge share one idempotent request key and the lease waits for it", async () => {
  const route = await readFile(
    path.join(process.cwd(), "app/(chat)/api/chat/route.ts"),
    "utf8"
  );
  const usageKeys = route.match(/requestKey: `chat:\$\{id\}:message:\$\{message\.id\}:usage`/g);
  expect(usageKeys).toHaveLength(1);

  const start = route.indexOf("const handleClientAbort = () => {");
  expect(start).toBeGreaterThan(0);
  const fromHandler = route.slice(start);
  const end = fromHandler.search(/request\.signal\.addEventListener\(\s*"abort"/);
  expect(end).toBeGreaterThan(0);
  const abortHandler = fromHandler.slice(0, end);
  // Billing goes through the shared report (one requestKey), never directly.
  expect(abortHandler).toContain("recordUsageReport(fallbackUsage");
  expect(abortHandler).not.toContain("recordTokenUsage(");
  expect(abortHandler).toContain("usageReportPromise = (async () => {");
  expect(abortHandler).toMatch(/finally \{\s*resolveUsageReady\?\.\(\);/);
  // The lease is released by after() only once usageReady resolves.
  expect(route).toMatch(/await usageReady;[\s\S]{0,200}await generationLease\?\.release\(\);/);
  expect(route).toContain("if (!usageReportPromise) resolveUsageReady?.();");
  expect(route).toMatch(/model: observeDispatchedInput\(resolveLanguageModel\(modelConfig\)/);
});
