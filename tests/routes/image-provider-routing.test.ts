import { expect, test } from "@playwright/test";
import { generateExternalProviderImage } from "@/lib/ai/image-provider-core";
import {
  getMaxReferenceImagesForProviderModel,
  normalizeImageProviderModelId,
  resolveImageProviderAdapter,
} from "@/lib/ai/image-provider-routing";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nL8AAAAASUVORK5CYII=";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

test.describe("hybrid image provider routing", () => {
  test("routes every configured provider without changing the shared DB enum", () => {
    expect(
      resolveImageProviderAdapter({
        provider: "google",
        providerModelId: "gemini-3.1-flash-image",
      })
    ).toBe("google");
    expect(
      resolveImageProviderAdapter({
        provider: "openai",
        providerModelId: "gpt-image-2",
      })
    ).toBe("openai");
    expect(
      resolveImageProviderAdapter({
        provider: "custom",
        providerModelId: "grok-imagine-image-quality",
      })
    ).toBe("xai");
    expect(
      resolveImageProviderAdapter({
        provider: "custom",
        providerModelId: "flux-2-pro",
      })
    ).toBe("bfl");
    expect(
      resolveImageProviderAdapter({
        provider: "custom",
        providerModelId: "bytedance/seedream-5.0-lite",
      })
    ).toBe("byteplus");
    expect(
      resolveImageProviderAdapter({
        provider: "anthropic",
        providerModelId: "not-an-image-model",
      })
    ).toBeNull();
  });

  test("uses provider-specific reference limits and resolves the Grok preview alias", () => {
    expect(
      getMaxReferenceImagesForProviderModel({
        provider: "custom",
        providerModelId: "grok-imagine-image-2.0",
      })
    ).toBe(3);
    expect(
      getMaxReferenceImagesForProviderModel({
        provider: "custom",
        providerModelId: "flux-2-pro",
      })
    ).toBe(8);
    expect(
      getMaxReferenceImagesForProviderModel({
        provider: "custom",
        providerModelId: "bytedance/seedream-5.0-lite",
      })
    ).toBe(14);
    expect(
      getMaxReferenceImagesForProviderModel({
        provider: "google",
        providerModelId: "gemini-3.1-flash-image",
      })
    ).toBe(14);
    expect(
      normalizeImageProviderModelId({
        adapter: "xai",
        providerModelId: "grok-imagine-image-2.0",
      })
    ).toBe("grok-imagine-image-quality");
  });

  test("sends Grok reference images to the JSON edit endpoint", async () => {
    const captured: {
      requestBody?: Record<string, unknown>;
      requestUrl?: string;
    } = {};
    const fetchMock: typeof fetch = async (input, init) => {
      captured.requestUrl = input.toString();
      captured.requestBody = JSON.parse(String(init?.body)) as Record<
        string,
        unknown
      >;
      return jsonResponse({
        data: [
          {
            b64_json: ONE_PIXEL_PNG_BASE64,
            mime_type: "image/png",
          },
        ],
      });
    };

    const result = await generateExternalProviderImage({
      adapter: "xai",
      images: [{ data: ONE_PIXEL_PNG_BASE64, mediaType: "image/png" }],
      modelId: "grok-imagine-image-2.0",
      prompt: "Keep this person's identity and change the background.",
      runtime: {
        env: { XAI_API_KEY: "test-xai-key" },
        fetch: fetchMock,
      },
    });

    expect(captured.requestUrl).toBe("https://api.x.ai/v1/images/edits");
    expect(captured.requestBody?.model).toBe("grok-imagine-image-quality");
    expect(captured.requestBody?.image).toEqual(
      expect.objectContaining({
        url: expect.stringContaining("data:image/png;base64,"),
      })
    );
    expect(result).toEqual([
      expect.objectContaining({ mediaType: "image/png" }),
    ]);
  });

  test("uses OpenAI generation and multipart edit requests", async () => {
    const requests: Array<{ body: BodyInit | null | undefined; url: string }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      requests.push({ body: init?.body, url: input.toString() });
      return jsonResponse({
        data: [{ b64_json: ONE_PIXEL_PNG_BASE64 }],
      });
    };
    const runtime = {
      env: { OPENAI_API_KEY: "test-openai-key" },
      fetch: fetchMock,
    };

    await generateExternalProviderImage({
      adapter: "openai",
      modelId: "gpt-image-2",
      prompt: "A hill station at sunrise",
      runtime,
    });
    await generateExternalProviderImage({
      adapter: "openai",
      images: [{ data: ONE_PIXEL_PNG_BASE64, mediaType: "image/png" }],
      modelId: "gpt-image-2",
      prompt: "Preserve the face and add studio lighting",
      runtime,
    });

    expect(requests[0]?.url).toBe(
      "https://api.openai.com/v1/images/generations"
    );
    expect(requests[1]?.url).toBe("https://api.openai.com/v1/images/edits");
    expect(requests[1]?.body).toBeInstanceOf(FormData);
    const editForm = requests[1]?.body as FormData;
    expect(editForm.get("model")).toBe("gpt-image-2");
    expect(editForm.get("image")).toBeInstanceOf(Blob);
  });

  test("polls BFL and downloads its signed image result", async () => {
    const urls: string[] = [];
    let clock = 0;
    const fetchMock: typeof fetch = async (input) => {
      const url = input.toString();
      urls.push(url);
      if (url === "https://api.bfl.ai/v1/flux-2-pro") {
        return jsonResponse({
          id: "request-1",
          polling_url: "https://api.bfl.ai/v1/get_result?id=request-1",
        });
      }
      if (url.startsWith("https://api.bfl.ai/v1/get_result")) {
        return jsonResponse({
          result: { sample: "https://delivery.example/generated.png" },
          status: "Ready",
        });
      }
      return new Response(Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"), {
        headers: { "Content-Type": "image/png" },
      });
    };

    const result = await generateExternalProviderImage({
      adapter: "bfl",
      images: [{ data: ONE_PIXEL_PNG_BASE64, mediaType: "image/png" }],
      modelId: "flux-2-pro",
      prompt: "Keep the same person in a new scene",
      runtime: {
        env: { BFL_API_KEY: "test-bfl-key" },
        fetch: fetchMock,
        now: () => clock,
        sleep: async (milliseconds) => {
          clock += milliseconds;
        },
      },
    });

    expect(urls).toEqual([
      "https://api.bfl.ai/v1/flux-2-pro",
      "https://api.bfl.ai/v1/get_result?id=request-1",
      "https://delivery.example/generated.png",
    ]);
    expect(result[0]?.mediaType).toBe("image/png");
  });

  test("sends Seedream reference images directly to BytePlus ModelArk", async () => {
    const captured: {
      body?: Record<string, unknown>;
      headers?: Headers;
      requestUrl?: string;
    } = {};
    const fetchMock: typeof fetch = async (input, init) => {
      captured.requestUrl = input.toString();
      captured.headers = new Headers(init?.headers);
      captured.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({
        data: [{ b64_json: ONE_PIXEL_PNG_BASE64 }],
      });
    };

    const result = await generateExternalProviderImage({
      adapter: "byteplus",
      images: [{ data: ONE_PIXEL_PNG_BASE64, mediaType: "image/png" }],
      modelId: "bytedance/seedream-5.0-lite",
      prompt: "Preserve the subject and change the clothing",
      runtime: {
        env: { ARK_API_KEY: "test-ark-key" },
        fetch: fetchMock,
      },
    });

    expect(captured.requestUrl).toBe(
      "https://ark.ap-southeast.bytepluses.com/api/v3/images/generations"
    );
    expect(captured.headers?.get("authorization")).toBe(
      "Bearer test-ark-key"
    );
    expect(captured.body?.model).toBe("seedream-5-0-260128");
    expect(captured.body?.image).toEqual(
      expect.stringContaining("data:image/png;base64,")
    );
    expect(captured.body?.sequential_image_generation).toBe("disabled");
    expect(captured.body?.response_format).toBe("b64_json");
    expect(result[0]?.mediaType).toBe("image/png");
  });

  test("fails clearly when a selected provider has no usable key", async () => {
    let thrown: unknown;
    try {
      await generateExternalProviderImage({
        adapter: "xai",
        modelId: "grok-imagine-image-quality",
        prompt: "A portrait",
        runtime: { env: { XAI_API_KEY: "" }, fetch },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).cause).toContain("XAI_API_KEY is missing");
  });
});
