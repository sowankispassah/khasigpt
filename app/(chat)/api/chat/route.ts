import { geolocation } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  smoothStream,
  streamText,
  type LanguageModelUsage,
  type StepResult,
} from "ai";
import { unstable_cache as cache } from "next/cache";
import { after } from "next/server";
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from "resumable-stream";
import type { ModelCatalog } from "tokenlens/core";
import { fetchModels } from "tokenlens/fetch";
import { getUsage } from "tokenlens/helpers";
import { auth, type UserRole } from "@/app/(auth)/auth";
import type { VisibilityType } from "@/components/visibility-selector";
import { entitlementsByUserRole } from "@/lib/ai/entitlements";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { resolveLanguageModel } from "@/lib/ai/providers";
import { getModelRegistry } from "@/lib/ai/model-registry";
import {
  CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
  DEFAULT_FREE_MESSAGES_PER_DAY,
  DEFAULT_RAG_TIMEOUT_MS,
  RAG_MATCH_THRESHOLD_SETTING_KEY,
  RAG_TIMEOUT_MS_SETTING_KEY,
  isProductionEnvironment,
} from "@/lib/constants";
import { loadFreeMessageSettings } from "@/lib/free-messages";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getAppSetting,
  getMessageCountByUserId,
  getMessagesByChatId,
  recordTokenUsage,
  getActiveSubscriptionForUser,
  saveChat,
  saveMessages,
  updateChatLastContextById,
  updateChatTitleById,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { convertToUIMessages, generateUUID, getTextFromMessage } from "@/lib/utils";
import { buildRagAugmentation } from "@/lib/rag/service";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";
import { DEFAULT_RAG_MATCH_THRESHOLD } from "@/lib/rag/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

let globalStreamContext: ResumableStreamContext | null = null;
let streamContextDisabled = false;

const RAG_AUGMENTATION_TIMEOUT_MS = 5000;
const RAG_TIMEOUT_SYMBOL = Symbol("rag-augmentation-timeout");
const DEFAULT_CHAT_TITLE = "New Chat";
const STREAM_HEADERS: HeadersInit = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};
const ONE_MINUTE = 60 * 1000;
const CHAT_RATE_LIMIT = {
  limit: 120,
  windowMs: ONE_MINUTE,
};

const getUsageNumber = (value: unknown): number =>
  typeof value === "number" ? value : 0;

const getTokenlensCatalog = cache(
  async (): Promise<ModelCatalog | undefined> => {
    try {
      return await fetchModels();
    } catch (err) {
      console.warn(
        "TokenLens: catalog fetch failed, using default catalog",
        err
      );
      return; // tokenlens helpers will fall back to defaultCatalog
    }
  },
  ["tokenlens-catalog"],
  { revalidate: 24 * 60 * 60 } // 24 hours
);

function hasRedisConnection() {
  return Boolean(process.env.REDIS_URL ?? process.env.KV_URL);
}

export function getStreamContext() {
  if (streamContextDisabled || !hasRedisConnection()) {
    if (!streamContextDisabled) {
      console.log(
        " > Resumable streams are disabled due to missing REDIS_URL/KV_URL"
      );
      streamContextDisabled = true;
    }
    return null;
  }

  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
    } catch (error) {
      console.error(error);
      streamContextDisabled = true;
      globalStreamContext = null;
      return null;
    }
  }

  return globalStreamContext;
}

const IST_OFFSET_MINUTES = 5.5 * 60;

function getStartOfTodayInIST() {
  const now = new Date();
  const istMillis = now.getTime() + IST_OFFSET_MINUTES * 60 * 1000;
  const istStart = new Date(istMillis);
  istStart.setUTCHours(0, 0, 0, 0);
  return new Date(istStart.getTime() - IST_OFFSET_MINUTES * 60 * 1000);
}

function buildFallbackTitleFromMessage(message: ChatMessage) {
  const text = getTextFromMessage(message).trim();
  if (!text) {
    return DEFAULT_CHAT_TITLE;
  }

  const normalized = text.replace(/\s+/g, " ");
  if (normalized.length <= 80) {
    return normalized;
  }

  return `${normalized.slice(0, 77).trim()}...`;
}

type RagAugmentationParams = Parameters<typeof buildRagAugmentation>[0];

async function buildRagAugmentationWithTimeout(
  params: RagAugmentationParams,
  timeoutMs: number
) {
  if (!params.useCustomKnowledge) {
    return null;
  }

  try {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const result = await Promise.race([
      buildRagAugmentation(params),
      new Promise<typeof RAG_TIMEOUT_SYMBOL>((resolve) => {
        timeout = setTimeout(
          () => resolve(RAG_TIMEOUT_SYMBOL),
          timeoutMs
        );
      }),
    ]);

    if (timeout) {
      clearTimeout(timeout);
    }

    if (result === RAG_TIMEOUT_SYMBOL) {
      console.warn(
        `RAG augmentation timed out after ${timeoutMs}ms`,
        { chatId: params.chatId }
      );
      return null;
    }

    return result;
  } catch (error) {
    console.warn("Failed to build RAG augmentation", { chatId: params.chatId }, error);
    return null;
  }
}

function enforceChatRateLimit(request: Request): Response | null {
  const clientKey = getClientKeyFromHeaders(request.headers);
  const { allowed, resetAt } = incrementRateLimit(
    `api:chat:${clientKey}`,
    CHAT_RATE_LIMIT
  );

  if (allowed) {
    return null;
  }

  const retryAfterSeconds = Math.max(
    Math.ceil((resetAt - Date.now()) / 1000),
    1
  ).toString();

  return new Response(
    JSON.stringify({
      code: "rate_limit:api",
      message: "Too many requests. Please try again later.",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": retryAfterSeconds,
      },
    }
  );
}

export async function POST(request: Request) {
  const rateLimited = enforceChatRateLimit(request);

  if (rateLimited) {
    return rateLimited;
  }

  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  try {
    const {
      id,
      message,
      selectedChatModel,
      selectedVisibilityType,
    }: {
      id: string;
      message: ChatMessage;
      selectedChatModel: string;
      selectedVisibilityType: VisibilityType;
    } = requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const userRole: UserRole = session.user.role;
    const { maxMessagesPerDay } = entitlementsByUserRole[userRole];

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      since: getStartOfTodayInIST(),
    });

    if (maxMessagesPerDay !== null && messageCount > maxMessagesPerDay) {
      return new ChatSDKError("rate_limit:chat").toResponse();
    }

    const [
      freeMessageSettings,
      registry,
      customKnowledgeSetting,
      ragTimeoutSetting,
      ragMatchThresholdSetting,
    ] = await Promise.all([
      loadFreeMessageSettings(),
      getModelRegistry(),
      getAppSetting<string | boolean>(CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY),
      getAppSetting<string | number>(RAG_TIMEOUT_MS_SETTING_KEY),
      getAppSetting<string | number>(RAG_MATCH_THRESHOLD_SETTING_KEY),
    ]);
    const enabledConfigs = registry.configs.filter(
      (config) => config.isEnabled
    );
    const modelConfig =
      enabledConfigs.find((config) => config.id === selectedChatModel) ??
      enabledConfigs.find((config) => config.isDefault) ??
      enabledConfigs[0];

    if (!modelConfig) {
      return new ChatSDKError(
        "bad_request:api",
        "No chat models are enabled. Please contact an administrator."
      ).toResponse();
    }

    const activeSubscription = await getActiveSubscriptionForUser(
      session.user.id
    );

    const activeTokenBalance = activeSubscription?.tokenBalance ?? 0;
    const hasActiveCredits = activeTokenBalance > 0;
    const perModelAllowance = Math.max(
      0,
      modelConfig.freeMessagesPerDay ?? DEFAULT_FREE_MESSAGES_PER_DAY
    );
    const globalAllowance = Math.max(0, freeMessageSettings.globalLimit);
    const freeMessagesForModel =
      freeMessageSettings.mode === "global"
        ? globalAllowance
        : perModelAllowance;

    const hasFreeDailyAllowance =
      !hasActiveCredits && messageCount < freeMessagesForModel;

    if (!hasActiveCredits && !hasFreeDailyAllowance) {
      return new ChatSDKError(
        "payment_required:credits",
        "You have no active credits remaining. Please recharge to continue."
      ).toResponse();
    }

    const customKnowledgeEnabled =
      typeof customKnowledgeSetting === "boolean"
        ? customKnowledgeSetting
        : typeof customKnowledgeSetting === "string"
          ? customKnowledgeSetting.toLowerCase() === "true"
          : false;

    const parsedTimeout =
      typeof ragTimeoutSetting === "number"
        ? ragTimeoutSetting
        : typeof ragTimeoutSetting === "string"
          ? Number(ragTimeoutSetting)
          : Number.NaN;
    const ragTimeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0
      ? Math.min(Math.max(1000, Math.round(parsedTimeout)), 60000)
      : DEFAULT_RAG_TIMEOUT_MS;
    const thresholdParsed =
      typeof ragMatchThresholdSetting === "number"
        ? ragMatchThresholdSetting
        : typeof ragMatchThresholdSetting === "string"
          ? Number(ragMatchThresholdSetting)
          : Number.NaN;
    const ragMatchThreshold = Number.isFinite(thresholdParsed) && thresholdParsed > 0
      ? Math.min(Math.max(thresholdParsed, 0.01), 1)
      : DEFAULT_RAG_MATCH_THRESHOLD;

    const chat = await getChatById({ id });

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError("forbidden:chat").toResponse();
      }
    } else {
      const fallbackTitle = buildFallbackTitleFromMessage(message);

      await saveChat({
        id,
        userId: session.user.id,
        title: fallbackTitle,
        visibility: selectedVisibilityType,
      });

      void (async () => {
        try {
          const generatedTitle = await generateTitleFromUserMessage({
            message,
            modelConfig,
          });
          const normalizedTitle = generatedTitle.trim();

          if (
            normalizedTitle.length > 0 &&
            normalizedTitle !== fallbackTitle
          ) {
            await updateChatTitleById({
              chatId: id,
              title: normalizedTitle,
            });
          }
        } catch (error) {
          console.warn("Failed to refresh chat title", { chatId: id }, error);
        }
      })();
    }

    const messagesFromDb = await getMessagesByChatId({ id });
    const uiMessages = [...convertToUIMessages(messagesFromDb), message];
    const ragAugmentation = await buildRagAugmentationWithTimeout({
      chatId: id,
      userId: session.user.id,
      modelConfig,
      queryText: getTextFromMessage(message),
      useCustomKnowledge: customKnowledgeEnabled,
      threshold: ragMatchThreshold,
    }, ragTimeoutMs);

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    const languageModel = resolveLanguageModel(modelConfig);
    const baseInstruction = systemPrompt({
      selectedChatModel,
      requestHints,
      modelSystemPrompt: modelConfig.systemPrompt ?? null,
    });
    const ragInstruction = ragAugmentation?.systemSupplement ?? null;
    const systemInstruction =
      [baseInstruction, ragInstruction]
        .filter((value) => typeof value === "string" && value.trim().length > 0)
        .join("\n\n") || null;

    const promptText = uiMessages.map((entry) => getTextFromMessage(entry)).join(" ");
    const estimateTokensFromText = (text: string) => {
      const trimmed = text.trim();
      if (!trimmed.length) {
        return 0;
      }
      return Math.max(1, Math.ceil(trimmed.length / 4));
    };
    const estimatedInputTokens = estimateTokensFromText(promptText);
    const persistUserMessagePromise = saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: "user",
          parts: message.parts,
          attachments: [],
          createdAt: new Date(),
        },
      ],
    }).catch((error) => {
      console.warn("Failed to persist user message", { chatId: id }, error);
    });

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    let finalMergedUsage: AppUsage | undefined;
    let latestStepUsage: LanguageModelUsage | null = null;
    let clientAborted = false;
    request.signal.addEventListener(
      "abort",
      () => {
        clientAborted = true;
      },
      { once: true }
    );
    let usageRecorded = false;
    let resolveUsageReady: (() => void) | null = null;
    const usageReady = new Promise<void>((resolve) => {
      resolveUsageReady = resolve;
    });
    const ragClientEvent = ragAugmentation?.clientEvent ?? null;
    after(async () => {
      try {
        await usageReady;
      } catch (error) {
        console.warn("Usage tracking did not complete", { chatId: id }, error);
      }
    });

    const recordUsageReport = async (
      usage: AppUsage,
      { persistContext }: { persistContext: boolean }
    ) => {
      finalMergedUsage = usage;

      if (persistContext) {
        try {
          await updateChatLastContextById({
            chatId: id,
            context: usage,
          });
        } catch (err) {
          console.warn("Unable to persist last usage for chat", id, err);
        }
      }

      if (usageRecorded) {
        return;
      }

      try {
        const usageFallback = usage as unknown as {
          promptTokens?: number;
          completionTokens?: number;
        };

        const inputTokens =
          typeof usage.inputTokens === "number"
            ? usage.inputTokens
            : getUsageNumber(usageFallback.promptTokens);

        const outputTokens =
          typeof usage.outputTokens === "number"
            ? usage.outputTokens
            : getUsageNumber(usageFallback.completionTokens);

        if (inputTokens > 0 || outputTokens > 0) {
          await recordTokenUsage({
            userId: session.user.id,
            chatId: id,
            modelConfigId: modelConfig.id,
            inputTokens,
            outputTokens,
            deductCredits: hasActiveCredits,
          });
          usageRecorded = true;
        }
      } catch (err) {
        if (err instanceof ChatSDKError) {
          throw err;
        }
        console.warn("Unable to record token usage", { chatId: id }, err);
      }
    };

    const handleUsageReport = async (
      usage: LanguageModelUsage,
      { persistContext }: { persistContext: boolean }
    ) => {
      let mergedUsage: AppUsage;

      try {
        const providers = await getTokenlensCatalog();
        const modelId = modelConfig.providerModelId;

        if (!providers) {
          mergedUsage = usage as AppUsage;
        } else {
          const summary = getUsage({ modelId, usage, providers });
          mergedUsage = { ...usage, ...summary, modelId } as AppUsage;
        }
      } catch (err) {
        console.warn("TokenLens enrichment failed", err);
        mergedUsage = usage as AppUsage;
      }

      await recordUsageReport(mergedUsage, { persistContext });
      resolveUsageReady?.();
    };

    const extractTextFromStep = (step?: StepResult<any>) => {
      if (!step?.content?.length) {
        return "";
      }
      const textSegments: string[] = [];
      for (const part of step.content) {
        if (typeof (part as any)?.text === "string") {
          textSegments.push((part as any).text);
        } else if (
          typeof (part as any)?.data === "object" &&
          typeof (part as any)?.data?.text === "string"
        ) {
          textSegments.push((part as any).data.text);
        }
      }
      return textSegments.join("").trim();
    };

    const persistAssistantSnapshot = async (
      step?: StepResult<any>,
      overrideText?: string
    ) => {
      const text = overrideText ?? extractTextFromStep(step);
      if (!text) {
        return;
      }

      await saveMessages({
        messages: [
          {
            chatId: id,
            id: generateUUID(),
            role: "assistant",
            parts: [{ type: "text", text }],
            attachments: [],
            createdAt: new Date(),
          },
        ],
      }).catch((error) => {
        console.warn("Failed to persist partial assistant message", error, {
          chatId: id,
        });
      });
    };

    let latestStepResult: StepResult<any> | null = null;
    let streamedText = "";
    let clientAbortHandled = false;

    const handleClientAbort = () => {
      clientAborted = true;

      if (clientAbortHandled) {
        return;
      }
      clientAbortHandled = true;

      if (latestStepUsage) {
        void (async () => {
          await persistAssistantSnapshot(latestStepResult ?? undefined);
          await handleUsageReport(latestStepUsage, { persistContext: false });
        })();
        return;
      }

      const partialText = streamedText.trim();
      if (partialText.length > 0) {
        const estimatedOutputTokens = estimateTokensFromText(partialText);
        const inputTokens = Math.max(1, estimatedInputTokens || 1);
        const fallbackUsage: AppUsage = {
          inputTokens,
          outputTokens: estimatedOutputTokens,
          totalTokens: inputTokens + estimatedOutputTokens,
          modelId: modelConfig.providerModelId,
        };

        void (async () => {
          await persistAssistantSnapshot(undefined, partialText);
          await recordUsageReport(fallbackUsage, { persistContext: false });
        })();
        return;
      }

      resolveUsageReady?.();
    };

    request.signal.addEventListener(
      "abort",
      () => {
        handleClientAbort();
      },
      { once: true }
    );

    const result = streamText({
      model: languageModel,
      ...(systemInstruction ? { system: systemInstruction } : {}),
      messages: convertToModelMessages(uiMessages),
      experimental_transform: smoothStream({ chunking: "word" }),
      experimental_telemetry: {
        isEnabled: isProductionEnvironment,
        functionId: "stream-text",
      },
      onChunk: ({ chunk }) => {
        if (chunk.type === "text-delta") {
          streamedText += chunk.text;
        }
      },
      abortSignal: request.signal,
      onFinish: async ({ usage }) => {
        await handleUsageReport(usage, { persistContext: !clientAborted });
      },
      onStepFinish: async (stepResult) => {
        latestStepUsage = stepResult?.usage ?? null;
        latestStepResult = stepResult ?? null;
      },
      onAbort: async ({ steps }) => {
        if (clientAbortHandled) {
          return;
        }
        const lastStep = steps.at(-1);
        await persistAssistantSnapshot(lastStep);
        const usage = lastStep?.usage ?? latestStepUsage;
        if (!usage) {
          resolveUsageReady?.();
          return;
        }
        await handleUsageReport(usage, { persistContext: !clientAborted });
      },
    });

    result.usage
      .then(async (usage) => {
        if (!usageRecorded && usage) {
          await handleUsageReport(usage, { persistContext: !clientAborted });
        }
      })
      .catch((error) => {
        console.warn("Unable to resolve stream usage", { chatId: id }, error);
      });

    const uiStream = result.toUIMessageStream({
      sendReasoning: modelConfig.supportsReasoning,
      onFinish: async ({ messages }) => {
        await saveMessages({
          messages: messages.map((currentMessage) => ({
            id:
              typeof currentMessage.id === "string" && currentMessage.id.length > 0
                ? currentMessage.id
                : generateUUID(),
            role: currentMessage.role,
            parts: currentMessage.parts,
            createdAt: new Date(),
            attachments: [],
            chatId: id,
          })),
        }).catch((error) => {
          console.warn("Failed to persist assistant messages", { chatId: id }, error);
        });

        await persistUserMessagePromise;

        if (!finalMergedUsage) {
          resolveUsageReady?.();
        }
      },
      onError: () => {
        return "Oops, an error occurred!";
      },
    });

    const combinedStream = new ReadableStream({
      start(controller) {
        if (ragClientEvent) {
          controller.enqueue({
            type: "data-ragUsage",
            data: ragClientEvent,
          });
        }

        const reader = uiStream.getReader();

        (async () => {
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) {
                break;
              }
              controller.enqueue(value);
            }

            await usageReady;

            if (finalMergedUsage) {
              controller.enqueue({
                type: "data-usage",
                data: finalMergedUsage,
              });
            }

            controller.close();
          } catch (error) {
            controller.error(error);
          } finally {
            reader.releaseLock();
          }
        })();
      },
    });

    const streamResponse = createUIMessageStreamResponse({
      stream: combinedStream,
      headers: STREAM_HEADERS,
    });

    return streamResponse;
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    // Check for Vercel AI Gateway credit card error
    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      return new ChatSDKError("bad_request:activate_gateway").toResponse();
    }

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatSDKError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}

