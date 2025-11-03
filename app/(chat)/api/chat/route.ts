import { geolocation } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  JsonToSseTransformStream,
  smoothStream,
  streamText,
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
import { isProductionEnvironment } from "@/lib/constants";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  recordTokenUsage,
  getActiveSubscriptionForUser,
  hasAnySubscriptionForUser,
  saveChat,
  saveMessages,
  updateChatLastContextById,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";
import type { AppUsage } from "@/lib/usage";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

let globalStreamContext: ResumableStreamContext | null = null;

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

export function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
    } catch (error: any) {
      if (error.message.includes("REDIS_URL")) {
        console.log(
          " > Resumable streams are disabled due to missing REDIS_URL"
        );
      } else {
        console.error(error);
      }
    }
  }

  return globalStreamContext;
}

const FREE_MESSAGES_PER_DAY = 3;

export async function POST(request: Request) {
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
      differenceInHours: 24,
    });

    if (maxMessagesPerDay !== null && messageCount > maxMessagesPerDay) {
      return new ChatSDKError("rate_limit:chat").toResponse();
    }


    const activeSubscription = await getActiveSubscriptionForUser(
      session.user.id
    );

    let hasSubscriptionHistory = false;

    if (!activeSubscription) {
      hasSubscriptionHistory = await hasAnySubscriptionForUser(session.user.id);
    }

    const hasFreeDailyAllowance =
      !activeSubscription &&
      !hasSubscriptionHistory &&
      messageCount < FREE_MESSAGES_PER_DAY;

    if (!activeSubscription && !hasFreeDailyAllowance) {
      return new ChatSDKError(
        "payment_required:credits",
        "You have no active credits remaining. Please recharge to continue."
      ).toResponse();
    }

    const registry = await getModelRegistry();
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

    const chat = await getChatById({ id });

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError("forbidden:chat").toResponse();
      }
    } else {
      const title = await generateTitleFromUserMessage({
        message,
      });

      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType,
      });
    }

    const messagesFromDb = await getMessagesByChatId({ id });
    const uiMessages = [...convertToUIMessages(messagesFromDb), message];

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    const languageModel = resolveLanguageModel(modelConfig);
    const systemInstruction = systemPrompt({
      selectedChatModel,
      requestHints,
      modelSystemPrompt: modelConfig.systemPrompt ?? null,
    });

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

    const stream = createUIMessageStream({
      execute: ({ writer: dataStream }) => {
        const result = streamText({
          model: languageModel,
          ...(systemInstruction ? { system: systemInstruction } : {}),
          messages: convertToModelMessages(uiMessages),
          experimental_transform: smoothStream({ chunking: "word" }),
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "stream-text",
          },
          onFinish: async ({ usage }) => {
            try {
              const providers = await getTokenlensCatalog();
              const modelId = modelConfig.providerModelId;

              if (!providers) {
                finalMergedUsage = usage;
                dataStream.write({
                  type: "data-usage",
                  data: finalMergedUsage,
                });
                return;
              }

              const summary = getUsage({ modelId, usage, providers });
              finalMergedUsage = { ...usage, ...summary, modelId } as AppUsage;
              dataStream.write({ type: "data-usage", data: finalMergedUsage });
            } catch (err) {
              console.warn("TokenLens enrichment failed", err);
              finalMergedUsage = usage;
              dataStream.write({ type: "data-usage", data: finalMergedUsage });
            }
          },
        });
        result.consumeStream();

        dataStream.merge(
          result.toUIMessageStream({
            sendReasoning: modelConfig.supportsReasoning,
          })
        );
      },
      generateId: generateUUID,
      onFinish: async ({ messages }) => {
        await saveMessages({
          messages: messages.map((currentMessage) => ({
            id: currentMessage.id,
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

        if (finalMergedUsage) {
          try {
            await updateChatLastContextById({
              chatId: id,
              context: finalMergedUsage,
            });
          } catch (err) {
            console.warn("Unable to persist last usage for chat", id, err);
          }

          try {
            const usageFallback = finalMergedUsage as unknown as {
              promptTokens?: number;
              completionTokens?: number;
            };

            const inputTokens =
              typeof finalMergedUsage.inputTokens === "number"
                ? finalMergedUsage.inputTokens
                : getUsageNumber(usageFallback.promptTokens);

            const outputTokens =
              typeof finalMergedUsage.outputTokens === "number"
                ? finalMergedUsage.outputTokens
                : getUsageNumber(usageFallback.completionTokens);

            if (inputTokens > 0 || outputTokens > 0) {
              await recordTokenUsage({
                userId: session.user.id,
                chatId: id,
                modelConfigId: modelConfig.id,
                inputTokens,
                outputTokens,
              });
            }
          } catch (err) {
            if (err instanceof ChatSDKError) {
              throw err;
            }
            console.warn("Unable to record token usage", { chatId: id }, err);
          }
        }
      },
      onError: () => {
        return "Oops, an error occurred!";
      },
    });

    // const streamContext = getStreamContext();

    // if (streamContext) {
    //   return new Response(
    //     await streamContext.resumableStream(streamId, () =>
    //       stream.pipeThrough(new JsonToSseTransformStream())
    //     )
    //   );
    // }

    return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
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

