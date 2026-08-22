import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  IMAGE_GENERATION_SAFETY_ERROR_CODE,
  IMAGE_GENERATION_SAFETY_MESSAGE,
  isImageGenerationSafetyRejection,
} from "@/lib/ai/image-generation-errors";
import { ChatSDKError } from "@/lib/errors";
import { STATIC_TRANSLATION_DEFINITIONS } from "@/lib/i18n/static-definitions";

const repoRoot = process.cwd();

test.describe("image generation failure recovery", () => {
  test("maps private safety details to KhasiGPT-owned user copy", () => {
    const error = new ChatSDKError(
      "bad_request:api",
      "Internal image request failed: output image may contain sensitive information."
    );

    expect(isImageGenerationSafetyRejection(error)).toBe(true);
    expect(
      isImageGenerationSafetyRejection(
        new ChatSDKError(
          "bad_request:api",
          "No image was returned (finishReason=safety)."
        )
      )
    ).toBe(true);
    expect(IMAGE_GENERATION_SAFETY_ERROR_CODE).toBe(
      "image_generation_safety_rejected"
    );
    expect(IMAGE_GENERATION_SAFETY_MESSAGE).toBe(
      "Couldn’t complete this image because the request was blocked by a safety check. Try changing the prompt and try again."
    );
    expect(IMAGE_GENERATION_SAFETY_MESSAGE).not.toMatch(
      /provider|model|reference image/i
    );
  });

  test("persists, returns, and immediately renders the failed assistant turn", async () => {
    const [routeSource, chatSource, querySource] = await Promise.all([
      readFile(path.join(repoRoot, "app/(chat)/api/images/route.ts"), "utf8"),
      readFile(path.join(repoRoot, "components/chat.tsx"), "utf8"),
      readFile(path.join(repoRoot, "lib/db/queries.ts"), "utf8"),
    ]);

    expect(routeSource).toContain("isImageGenerationSafetyRejection(error)");
    expect(routeSource).toContain("assistantMessage,");
    expect(routeSource).toContain("statusReason: failureMessage");
    expect(routeSource).toContain("new Date(now.getTime() + 1)");
    expect(chatSource).toContain("if (failedAssistantMessage)");
    expect(chatSource).toContain("refreshAndPromoteHistory()");
    expect(querySource).toContain(
      "WHEN $" + "{message.role} = 'user' THEN 0"
    );
    expect(querySource).toContain("asc(roleOrder)");
  });

  test("registers translatable safety copy", () => {
    expect(STATIC_TRANSLATION_DEFINITIONS).toContainEqual(
      expect.objectContaining({
        key: "image.generate.safety_rejected",
        defaultText: IMAGE_GENERATION_SAFETY_MESSAGE,
      })
    );
  });
});
