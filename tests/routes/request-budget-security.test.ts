import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import { expect, test } from "@playwright/test";
import { generateText, streamText } from "ai";
import sharp from "sharp";
import ts from "typescript";
import { postRequestBodySchema } from "@/app/(chat)/api/chat/schema";
import { boundedChatModel } from "@/lib/ai/bounded-chat-model";
import { budgetedModel } from "@/lib/ai/budgeted-model";
import {
  RequestBodyLimitError,
  readBoundedBody,
  readBoundedFormData,
  readBoundedJson,
} from "@/lib/security/request-body";
import { validateImageBytes } from "@/lib/uploads/image-validation";
import { docxFixture, pdfFixture } from "../support/attachment-fixtures";

const realRequire = createRequire(path.join(process.cwd(), "package.json"));
function parserModule(spawnOverride?: unknown, fastDeadline = false) {
  const exports: Record<string, any> = {};
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync("lib/uploads/chat-document-parser.ts", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      },
    ).outputText,
    {
      exports,
      Buffer,
      Date,
      setTimeout: fastDeadline
        ? (fn: () => void, ms: number) =>
            setTimeout(fn, ms === 15000 ? 150 : ms)
        : setTimeout,
      clearTimeout,
      process,
      require: Object.assign(
        (name: string) =>
          name === "server-only"
            ? {}
            : name === "node:child_process" && spawnOverride
              ? { spawn: spawnOverride }
              : realRequire(name),
        { resolve: realRequire.resolve },
      ),
    },
  );
  return exports;
}
const parser = parserModule();

test("internal title generation caps provider output and excludes attachment payloads", async () => {
  const calls: Array<Parameters<LanguageModelV2["doGenerate"]>[0]> = [];
  const model: LanguageModelV2 = {
    specificationVersion: "v2",
    provider: "fixture",
    modelId: "title",
    supportedUrls: {},
    doGenerate: async (params) => {
      calls.push(params);
      return {
        content: [{ type: "text", text: "t".repeat(100) }],
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        warnings: [],
      };
    },
    doStream: async () => {
      throw new Error("Unexpected title streaming.");
    },
  };
  const exports: Record<string, any> = {};
  vm.runInNewContext(
    ts.transpileModule(readFileSync("lib/ai/chat-title.ts", "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      require: (name: string) => {
        if (name === "server-only") return {};
        if (name === "ai") return { generateText };
        if (name === "next/headers")
          return { cookies: async () => ({ get: () => ({ value: "en" }) }) };
        if (name === "@/lib/ai/providers")
          return { getTitleLanguageModel: () => model };
        throw new Error(`Unexpected import: ${name}`);
      },
    },
  );
  const title = await exports.generateTitleFromUserMessage({
    message: {
      id: "fixture",
      role: "user",
      parts: [
        { type: "text", text: "x".repeat(10_000) },
        {
          type: "file",
          url: "private-attachment-must-not-be-sent",
          mediaType: "image/png",
        },
      ],
    },
  });
  expect(title).toHaveLength(80);
  expect(calls).toHaveLength(1);
  expect(calls[0].maxOutputTokens).toBe(256);
  const prompt = JSON.stringify(calls[0].prompt);
  expect(prompt).not.toContain("private-attachment-must-not-be-sent");
  expect(prompt).not.toContain("x".repeat(8001));
});

test("actual stream byte limits reject missing or dishonest Content-Length and cancel reading", async () => {
  for (const header of [undefined, "1"]) {
    let cancelled = false;
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(6));
        controller.enqueue(new Uint8Array(6));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("https://fixture.test", {
      method: "POST",
      body,
      duplex: "half",
      headers: header ? { "content-length": header } : {},
    } as RequestInit);
    await expect(readBoundedBody(request, 10)).rejects.toBeInstanceOf(
      RequestBodyLimitError,
    );
    expect(cancelled).toBe(true);
  }
  const known = new Request("https://fixture.test", {
    method: "POST",
    body: "x",
    headers: { "content-length": "11" },
  });
  await expect(readBoundedBody(known, 10)).rejects.toBeInstanceOf(
    RequestBodyLimitError,
  );
  expect(
    await readBoundedJson(
      new Request("https://fixture.test", {
        method: "POST",
        body: '{"ok":true}',
      }),
      11,
    ),
  ).toEqual({ ok: true });
  await expect(
    readBoundedJson(
      new Request("https://fixture.test", {
        method: "POST",
        body: '{"ok":true}',
      }),
      10,
    ),
  ).rejects.toBeInstanceOf(RequestBodyLimitError);
});

test("multipart byte limits apply to all fields before decoding form data", async () => {
  const form = new FormData();
  form.set("file", new File(["small"], "fixture.txt"));
  form.set("padding", "x".repeat(5000));
  // Serialize the fixture first: Node's outgoing multipart encoder itself
  // throws asynchronously if its generated stream is cancelled during encode.
  const encoded = new Request("https://fixture.test", {
    method: "POST",
    body: form,
  });
  const bytes = await encoded.arrayBuffer();
  await expect(
    readBoundedFormData(
      new Request("https://fixture.test", {
        method: "POST",
        headers: encoded.headers,
        body: bytes,
      }),
      1000,
    ),
  ).rejects.toBeInstanceOf(RequestBodyLimitError);
});

test("chat schema bounds parts, total text, attachment count and URL length", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const request = (parts: object[]) => ({
    id,
    message: { id, role: "user", parts },
    selectedVisibilityType: "private",
  });
  const text = { type: "text", text: "x".repeat(2000) };
  const file = {
    type: "file",
    mediaType: "image/png",
    name: "image",
    url: "https://fixture.test/image",
  };
  expect(postRequestBodySchema.safeParse(request([text, file])).success).toBe(
    true,
  );
  for (const parts of [
    [],
    Array.from({ length: 13 }, () => ({ type: "text", text: "x" })),
    Array(5).fill(text),
    Array(5).fill(file),
    [{ ...file, url: `https://fixture.test/${"x".repeat(4096)}` }],
  ]) {
    expect(postRequestBodySchema.safeParse(request(parts)).success).toBe(false);
  }
});

test("free generation and streaming send hard output ceilings to the actual SDK adapter", async () => {
  const seen: number[] = [];
  const provider: LanguageModelV2 = {
    specificationVersion: "v2",
    provider: "fixture",
    modelId: "fixture",
    supportedUrls: {},
    doGenerate: async (params) => {
      seen.push(params.maxOutputTokens ?? 0);
      return {
        content: [{ type: "text", text: "safe" }],
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        warnings: [],
      };
    },
    doStream: async (params) => {
      seen.push(params.maxOutputTokens ?? 0);
      return {
        stream: new ReadableStream({
          start(c) {
            c.enqueue({ type: "text-start", id: "t" });
            c.enqueue({ type: "text-delta", id: "t", delta: "safe" });
            c.enqueue({ type: "text-end", id: "t" });
            c.enqueue({
              type: "finish",
              finishReason: "stop",
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            });
            c.close();
          },
        }),
      };
    },
  };
  const model = boundedChatModel(provider, 2048);
  await generateText({
    model,
    prompt: "hello",
    maxOutputTokens: 100000,
    maxRetries: 0,
  });
  expect(await streamText({ model, prompt: "hello", maxRetries: 0 }).text).toBe(
    "safe",
  );
  expect(seen).toEqual([2048, 2048]);
  await expect(
    generateText({ model, prompt: "x".repeat(512 * 1024 + 1), maxRetries: 0 }),
  ).rejects.toThrow();
  expect(seen).toHaveLength(2);
  const wallet = budgetedModel({
    model: provider,
    provider: "openai",
    modelId: "fixture",
    pricing: {
      providerKey: "fixture",
      inputCostPerMillionUsd: 1,
      outputCostPerMillionUsd: 10,
      markupMultiplier: 4,
      usdToInr: 100,
      walletUnitsPerInr: 100,
      pricingReferencePlanId: "fixture",
    },
    balance: () => 200,
  });
  await generateText({
    model: boundedChatModel(wallet, 4096),
    prompt: "hello",
    maxRetries: 0,
  });
  expect(seen.at(-1)).toBeLessThan(4096);
});

test("images require recognized bytes and bounded decoded dimensions", async () => {
  const image = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "green" },
  })
    .png()
    .toBuffer();
  expect(await validateImageBytes(image)).toBe("image/png");
  await expect(
    validateImageBytes(Buffer.from("not an image")),
  ).rejects.toThrow();
  await expect(
    validateImageBytes(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>',
      ),
      true,
    ),
  ).rejects.toThrow();
  const huge = await sharp({
    create: { width: 5000, height: 4000, channels: 3, background: "green" },
  })
    .png()
    .toBuffer();
  await expect(validateImageBytes(huge)).rejects.toThrow();
});

test("real isolated document workers parse PDF/DOCX and reject fake, excessive-page and compressed bomb inputs", async () => {
  for (const [buffer, mediaType] of [
    [pdfFixture(), "application/pdf"],
    [
      docxFixture(),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  ] as const) {
    const result = await parser.extractChatDocument({
      ownerId: "disposable",
      name: "fixture",
      buffer,
      mediaType,
    });
    expect(result.text).toContain("KhasiGPT");
    expect(result.truncated).toBe(false);
  }
  for (const [buffer, mediaType] of [
    [Buffer.from("fake PDF"), "application/pdf"],
    [pdfFixture(101), "application/pdf"],
    [
      docxFixture("x".repeat(500000)),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    [
      docxFixture("safe", 1),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  ] as const) {
    await expect(
      parser.extractChatDocument({ ownerId: "disposable", buffer, mediaType }),
    ).rejects.toThrow();
  }
});

test("parser saturation fails promptly and its deadline kills child work and releases capacity", async () => {
  const children: import("node:child_process").ChildProcess[] = [];
  const isolated = parserModule(
    (_file: string, args: string[], options: object) => {
      const child = realRequire("node:child_process").spawn(
        process.execPath,
        [
          args[0],
          path.join(process.cwd(), "tests/support/stuck-document-worker.cjs"),
        ],
        options,
      );
      children.push(child);
      return child;
    },
    true,
  );
  const parse = () =>
    isolated.extractChatDocument({
      ownerId: "disposable",
      mediaType: "application/pdf",
      buffer: pdfFixture(),
    });
  const started = Date.now();
  const work = [
    parse().catch((error: Error) => error),
    parse().catch((error: Error) => error),
  ];
  await expect(parse()).rejects.toThrow("busy");
  await Promise.all(work);
  expect(Date.now() - started).toBeLessThan(5000);
  expect(children).toHaveLength(2);
  for (const child of children) expect(child.signalCode).toBe("SIGKILL");
  await expect(parse()).rejects.toThrow("Unable to read document");
  expect(children).toHaveLength(3);
});
