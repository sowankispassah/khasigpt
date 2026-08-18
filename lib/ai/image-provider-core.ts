import { detectImageMime } from "@/lib/ai/character-reference-core";
import {
  type ImageProviderAdapter,
  normalizeImageProviderModelId,
} from "@/lib/ai/image-provider-routing";
import type { ImageInput } from "@/lib/ai/image-types";
import { ChatSDKError } from "@/lib/errors";

const XAI_API_BASE_URL = "https://api.x.ai/v1";
const OPENAI_API_BASE_URL = "https://api.openai.com/v1";
const BFL_API_BASE_URL = "https://api.bfl.ai/v1";
const BYTEPLUS_ARK_API_BASE_URL =
  "https://ark.ap-southeast.bytepluses.com/api/v3";
const GATEWAY_IMAGE_URL = "https://ai-gateway.vercel.sh/v4/ai/image-model";
const MAX_PROVIDER_IMAGE_BYTES = 25 * 1024 * 1024;
const BFL_POLL_INTERVAL_MS = 1000;
const BFL_POLL_TIMEOUT_MS = 240_000;

export type GeneratedProviderImage = {
  base64: string;
  mediaType: string;
};

type ProviderEnvironment = Partial<
  Record<
    | "AI_GATEWAY_API_KEY"
    | "ARK_API_KEY"
    | "BFL_API_KEY"
    | "OPENAI_API_KEY"
    | "VERCEL_OIDC_TOKEN"
    | "XAI_API_KEY",
    string
  >
>;

export type ImageProviderRuntime = {
  env: ProviderEnvironment;
  fetch: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number, abortSignal?: AbortSignal) => Promise<void>;
};

type ProviderResponseImage = {
  b64_json?: unknown;
  base64?: unknown;
  mime_type?: unknown;
  mimeType?: unknown;
  url?: unknown;
};

function requireProviderKey(
  env: ProviderEnvironment,
  keyName: keyof ProviderEnvironment,
  providerLabel: string
) {
  const value = env[keyName]?.trim();
  if (!value) {
    throw new ChatSDKError(
      "bad_request:configuration",
      `${keyName} is missing for ${providerLabel} image generation.`
    );
  }
  return value;
}

function getProviderErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.message === "string") {
    return record.message;
  }
  if (typeof record.error === "string") {
    return record.error;
  }
  if (record.error && typeof record.error === "object") {
    const nested = record.error as Record<string, unknown>;
    if (typeof nested.message === "string") {
      return nested.message;
    }
  }
  return null;
}

async function readProviderJson(response: Response, providerLabel: string) {
  const text = await response.text();
  let value: unknown = null;
  if (text) {
    try {
      value = JSON.parse(text);
    } catch {
      value = null;
    }
  }

  if (!response.ok) {
    const providerMessage = getProviderErrorMessage(value);
    const suffix = providerMessage
      ? `: ${providerMessage.slice(0, 300)}`
      : "";
    throw new ChatSDKError(
      "bad_request:api",
      `${providerLabel} image request failed (${response.status})${suffix}`
    );
  }

  if (!value || typeof value !== "object") {
    throw new ChatSDKError(
      "bad_request:api",
      `${providerLabel} returned an invalid image response.`
    );
  }

  return value as Record<string, unknown>;
}

function detectBase64MediaType(base64: string, declaredType?: string | null) {
  try {
    const bytes = Buffer.from(base64, "base64");
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    );
    return detectImageMime(buffer, declaredType) ?? declaredType ?? "image/png";
  } catch {
    return declaredType ?? "image/png";
  }
}

function dataUrlForImage(image: ImageInput) {
  return `data:${image.mediaType};base64,${image.data}`;
}

async function downloadProviderImage({
  abortSignal,
  fetchImpl,
  url,
}: {
  abortSignal?: AbortSignal;
  fetchImpl: typeof fetch;
  url: string;
}): Promise<GeneratedProviderImage> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ChatSDKError(
      "bad_request:api",
      "The image provider returned an invalid image URL."
    );
  }
  if (parsed.protocol !== "https:") {
    throw new ChatSDKError(
      "bad_request:api",
      "The image provider returned an insecure image URL."
    );
  }

  const response = await fetchImpl(parsed, {
    cache: "no-store",
    signal: abortSignal,
  });
  if (!response.ok) {
    throw new ChatSDKError(
      "bad_request:api",
      `Unable to download the generated image (${response.status}).`
    );
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_PROVIDER_IMAGE_BYTES) {
    throw new ChatSDKError(
      "bad_request:api",
      "The generated image exceeded the maximum supported size."
    );
  }
  const declaredType = response.headers.get("content-type")?.split(";")[0];
  const mediaType = detectImageMime(buffer, declaredType);
  if (!mediaType) {
    throw new ChatSDKError(
      "bad_request:api",
      "The provider response was not a supported PNG or JPEG image."
    );
  }

  return {
    base64: Buffer.from(buffer).toString("base64"),
    mediaType,
  };
}

async function collectProviderImages({
  abortSignal,
  fetchImpl,
  responseImages,
}: {
  abortSignal?: AbortSignal;
  fetchImpl: typeof fetch;
  responseImages: unknown;
}) {
  if (!Array.isArray(responseImages) || responseImages.length === 0) {
    throw new ChatSDKError(
      "bad_request:api",
      "The image provider returned no images."
    );
  }

  const images: GeneratedProviderImage[] = [];
  for (const rawImage of responseImages) {
    if (!rawImage || typeof rawImage !== "object") {
      continue;
    }
    const image = rawImage as ProviderResponseImage;
    const declaredType =
      typeof image.mime_type === "string"
        ? image.mime_type
        : typeof image.mimeType === "string"
          ? image.mimeType
          : null;
    const base64 =
      typeof image.b64_json === "string"
        ? image.b64_json
        : typeof image.base64 === "string"
          ? image.base64
          : null;

    if (base64) {
      images.push({
        base64,
        mediaType: detectBase64MediaType(base64, declaredType),
      });
      continue;
    }
    if (typeof image.url === "string") {
      images.push(
        await downloadProviderImage({
          abortSignal,
          fetchImpl,
          url: image.url,
        })
      );
    }
  }

  if (images.length === 0) {
    throw new ChatSDKError(
      "bad_request:api",
      "The image provider returned no usable images."
    );
  }
  return images;
}

async function generateXaiImage({
  abortSignal,
  fetchImpl,
  images,
  modelId,
  prompt,
  runtime,
}: ProviderGenerationInput) {
  const apiKey = requireProviderKey(runtime.env, "XAI_API_KEY", "xAI Grok");
  const resolvedModelId = normalizeImageProviderModelId({
    adapter: "xai",
    providerModelId: modelId,
  });
  const hasImages = Boolean(images?.length);
  const imageDataUrls = (images ?? []).map(dataUrlForImage);
  const body: Record<string, unknown> = {
    model: resolvedModelId,
    n: 1,
    prompt,
    response_format: "b64_json",
  };
  if (imageDataUrls.length === 1) {
    body.image = { url: imageDataUrls[0] };
  } else if (imageDataUrls.length > 1) {
    body.images = imageDataUrls.map((url) => ({
      type: "image_url",
      url,
    }));
  }

  const response = await fetchImpl(
    `${XAI_API_BASE_URL}/images/${hasImages ? "edits" : "generations"}`,
    {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: abortSignal,
    }
  );
  const value = await readProviderJson(response, "xAI Grok");
  return collectProviderImages({
    abortSignal,
    fetchImpl,
    responseImages: value.data,
  });
}

function imageBlob(image: ImageInput) {
  return new Blob([Buffer.from(image.data, "base64")], {
    type: image.mediaType,
  });
}

async function generateOpenAiImage({
  abortSignal,
  fetchImpl,
  images,
  modelId,
  prompt,
  runtime,
}: ProviderGenerationInput) {
  const apiKey = requireProviderKey(runtime.env, "OPENAI_API_KEY", "OpenAI");
  const resolvedModelId = normalizeImageProviderModelId({
    adapter: "openai",
    providerModelId: modelId,
  });
  let body: BodyInit;
  let contentTypeHeader: Record<string, string> = {
    "Content-Type": "application/json",
  };
  let endpoint = "generations";

  if (images?.length) {
    endpoint = "edits";
    const form = new FormData();
    form.append("model", resolvedModelId);
    form.append("prompt", prompt);
    form.append("response_format", "b64_json");
    for (const [index, image] of images.entries()) {
      form.append(
        images.length === 1 ? "image" : "image[]",
        imageBlob(image),
        `reference-${index + 1}.${image.mediaType.includes("png") ? "png" : "jpg"}`
      );
    }
    body = form;
    contentTypeHeader = {};
  } else {
    body = JSON.stringify({
      model: resolvedModelId,
      n: 1,
      prompt,
      response_format: "b64_json",
    });
  }

  const response = await fetchImpl(`${OPENAI_API_BASE_URL}/images/${endpoint}`, {
    body,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...contentTypeHeader,
    },
    method: "POST",
    signal: abortSignal,
  });
  const value = await readProviderJson(response, "OpenAI");
  return collectProviderImages({
    abortSignal,
    fetchImpl,
    responseImages: value.data,
  });
}

function defaultSleep(milliseconds: number, abortSignal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(abortSignal.reason ?? new Error("Image generation aborted"));
      return;
    }
    const timeout = setTimeout(resolve, milliseconds);
    abortSignal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(abortSignal.reason ?? new Error("Image generation aborted"));
      },
      { once: true }
    );
  });
}

function assertBflModelId(modelId: string) {
  if (!/^flux-[a-z0-9.-]+$/i.test(modelId)) {
    throw new ChatSDKError(
      "bad_request:configuration",
      "The configured Black Forest Labs model ID is invalid."
    );
  }
}

async function generateBflImage({
  abortSignal,
  fetchImpl,
  images,
  modelId,
  prompt,
  runtime,
}: ProviderGenerationInput) {
  const apiKey = requireProviderKey(
    runtime.env,
    "BFL_API_KEY",
    "Black Forest Labs"
  );
  const resolvedModelId = normalizeImageProviderModelId({
    adapter: "bfl",
    providerModelId: modelId,
  });
  assertBflModelId(resolvedModelId);

  const body: Record<string, unknown> = {
    output_format: "png",
    prompt,
  };
  for (const [index, image] of (images ?? []).entries()) {
    body[index === 0 ? "input_image" : `input_image_${index + 1}`] = image.data;
  }

  const createResponse = await fetchImpl(
    `${BFL_API_BASE_URL}/${resolvedModelId}`,
    {
      body: JSON.stringify(body),
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
        "x-key": apiKey,
      },
      method: "POST",
      signal: abortSignal,
    }
  );
  const created = await readProviderJson(
    createResponse,
    "Black Forest Labs"
  );
  const pollingUrl =
    typeof created.polling_url === "string" ? created.polling_url : null;
  if (!pollingUrl) {
    throw new ChatSDKError(
      "bad_request:api",
      "Black Forest Labs did not return a polling URL."
    );
  }

  let parsedPollingUrl: URL;
  try {
    parsedPollingUrl = new URL(pollingUrl);
  } catch {
    throw new ChatSDKError(
      "bad_request:api",
      "Black Forest Labs returned an invalid polling URL."
    );
  }
  if (
    parsedPollingUrl.protocol !== "https:" ||
    parsedPollingUrl.hostname !== "api.bfl.ai"
  ) {
    throw new ChatSDKError(
      "bad_request:api",
      "Black Forest Labs returned an untrusted polling URL."
    );
  }

  const now = runtime.now ?? Date.now;
  const sleep = runtime.sleep ?? defaultSleep;
  const deadline = now() + BFL_POLL_TIMEOUT_MS;
  while (now() < deadline) {
    await sleep(BFL_POLL_INTERVAL_MS, abortSignal);
    const pollResponse = await fetchImpl(parsedPollingUrl, {
      headers: {
        accept: "application/json",
        "x-key": apiKey,
      },
      signal: abortSignal,
    });
    const polled = await readProviderJson(
      pollResponse,
      "Black Forest Labs"
    );
    const status =
      typeof polled.status === "string" ? polled.status.toLowerCase() : "";
    if (status === "ready") {
      const result =
        polled.result && typeof polled.result === "object"
          ? (polled.result as Record<string, unknown>)
          : null;
      if (!result || typeof result.sample !== "string") {
        throw new ChatSDKError(
          "bad_request:api",
          "Black Forest Labs returned no generated image."
        );
      }
      return [
        await downloadProviderImage({
          abortSignal,
          fetchImpl,
          url: result.sample,
        }),
      ];
    }
    if (status === "error" || status === "failed") {
      throw new ChatSDKError(
        "bad_request:api",
        `Black Forest Labs image generation ended with status ${status}.`
      );
    }
  }

  throw new ChatSDKError(
    "bad_request:api",
    "Black Forest Labs image generation did not complete in time."
  );
}

async function generateBytePlusImage({
  abortSignal,
  fetchImpl,
  images,
  modelId,
  prompt,
  runtime,
}: ProviderGenerationInput) {
  const apiKey = requireProviderKey(
    runtime.env,
    "ARK_API_KEY",
    "BytePlus ModelArk"
  );
  const resolvedModelId = normalizeImageProviderModelId({
    adapter: "byteplus",
    providerModelId: modelId,
  });
  const imageDataUrls = (images ?? []).map(dataUrlForImage);
  const body: Record<string, unknown> = {
    model: resolvedModelId,
    output_format: "png",
    prompt,
    response_format: "b64_json",
    sequential_image_generation: "disabled",
    size: "2K",
    watermark: false,
  };
  if (imageDataUrls.length === 1) {
    body.image = imageDataUrls[0];
  } else if (imageDataUrls.length > 1) {
    body.image = imageDataUrls;
  }

  const response = await fetchImpl(
    `${BYTEPLUS_ARK_API_BASE_URL}/images/generations`,
    {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: abortSignal,
    }
  );
  const value = await readProviderJson(response, "BytePlus ModelArk");
  return collectProviderImages({
    abortSignal,
    fetchImpl,
    responseImages: value.data,
  });
}

function resolveGatewayCredential(env: ProviderEnvironment) {
  const apiKey = env.AI_GATEWAY_API_KEY?.trim();
  if (apiKey) {
    return { authMethod: "api-key", token: apiKey };
  }
  const oidcToken = env.VERCEL_OIDC_TOKEN?.trim();
  if (oidcToken) {
    return { authMethod: "oidc", token: oidcToken };
  }
  throw new ChatSDKError(
    "bad_request:configuration",
    "AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN is required for AI Gateway image generation."
  );
}

async function generateGatewayImage({
  abortSignal,
  fetchImpl,
  images,
  modelId,
  prompt,
  runtime,
}: ProviderGenerationInput) {
  const credential = resolveGatewayCredential(runtime.env);
  const response = await fetchImpl(GATEWAY_IMAGE_URL, {
    body: JSON.stringify({
      files: images?.map((image) => ({
        data: image.data,
        mediaType: image.mediaType,
        type: "file",
      })),
      n: 1,
      prompt,
    }),
    headers: {
      Authorization: `Bearer ${credential.token}`,
      "Content-Type": "application/json",
      "ai-gateway-auth-method": credential.authMethod,
      "ai-gateway-protocol-version": "0.0.1",
      "ai-image-model-specification-version": "4",
      "ai-model-id": modelId.trim(),
    },
    method: "POST",
    signal: abortSignal,
  });
  const value = await readProviderJson(response, "Vercel AI Gateway");
  const rawImages = Array.isArray(value.images)
    ? value.images.map((base64) => ({ base64 }))
    : [];
  return collectProviderImages({
    abortSignal,
    fetchImpl,
    responseImages: rawImages,
  });
}

type ProviderGenerationInput = {
  abortSignal?: AbortSignal;
  fetchImpl: typeof fetch;
  images?: ImageInput[];
  modelId: string;
  prompt: string;
  runtime: ImageProviderRuntime;
};

export async function generateExternalProviderImage({
  abortSignal,
  adapter,
  images,
  modelId,
  prompt,
  runtime,
}: {
  abortSignal?: AbortSignal;
  adapter: Exclude<ImageProviderAdapter, "google">;
  images?: ImageInput[];
  modelId: string;
  prompt: string;
  runtime: ImageProviderRuntime;
}) {
  const input: ProviderGenerationInput = {
    abortSignal,
    fetchImpl: runtime.fetch,
    images,
    modelId,
    prompt,
    runtime,
  };
  switch (adapter) {
    case "xai":
      return generateXaiImage(input);
    case "openai":
      return generateOpenAiImage(input);
    case "bfl":
      return generateBflImage(input);
    case "byteplus":
      return generateBytePlusImage(input);
    case "gateway":
      return generateGatewayImage(input);
  }
}
