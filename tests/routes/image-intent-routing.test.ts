import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  fallbackImageIntent,
  type ImageIntentInput,
  normalizeImageIntent,
  shouldClassifyImageIntent,
} from "@/lib/image-intent";

const repoRoot = process.cwd();

function intentInput(
  message: string,
  overrides: Partial<ImageIntentInput> = {}
): ImageIntentInput {
  return {
    message,
    imageHintSelected: false,
    hasImageAttachment: false,
    hasPriorGeneratedImage: false,
    recentMessages: [],
    ...overrides,
  };
}

test.describe("image intent routing", () => {
  test("Flow A detects an image request without the image button", () => {
    const input = intentInput(
      "Generate an image of Shillong during snowfall."
    );

    expect(shouldClassifyImageIntent(input)).toBe(true);
    expect(fallbackImageIntent(input)).toBe("image_generate");
    expect(
      shouldClassifyImageIntent(
        intentInput("Create something where a dog is flying over Shillong.")
      )
    ).toBe(true);
  });

  test("Flows B and F keep acknowledgments in normal chat despite the UI hint", () => {
    for (const message of [
      "Nice.",
      "Thanks, that's exactly what I wanted.",
    ]) {
      const input = intentInput(message, {
        imageHintSelected: true,
        hasPriorGeneratedImage: true,
      });

      expect(shouldClassifyImageIntent(input)).toBe(true);
      expect(fallbackImageIntent(input)).toBe("normal_chat");
    }
  });

  test("Flow C routes a contextual modification to image editing", () => {
    const input = intentInput("Make the sunglasses red.", {
      hasPriorGeneratedImage: true,
      recentMessages: [
        { role: "assistant", text: "", hasImage: true },
      ],
    });

    expect(shouldClassifyImageIntent(input)).toBe(true);
    expect(fallbackImageIntent(input)).toBe("image_edit");
  });

  test("Flow D treats an explicit new subject as a new generation", () => {
    const input = intentInput("Now generate a cat riding a bicycle.", {
      hasPriorGeneratedImage: true,
    });

    expect(shouldClassifyImageIntent(input)).toBe(true);
    expect(normalizeImageIntent("image_generate", input)).toBe(
      "image_generate"
    );
  });

  test("an edit decision without an available image fails safely", () => {
    const input = intentInput("Make it brighter.");
    expect(normalizeImageIntent("image_edit", input)).toBe("normal_chat");
  });

  test("submission is intent-driven and the API confirms intent before credits", async () => {
    const [inputSource, chatSource, imageRouteSource] = await Promise.all([
      readFile(path.join(repoRoot, "components/multimodal-input.tsx"), "utf8"),
      readFile(path.join(repoRoot, "components/chat.tsx"), "utf8"),
      readFile(
        path.join(repoRoot, "app/(chat)/api/images/route.ts"),
        "utf8"
      ),
    ]);

    expect(inputSource).toContain("submitWithIntent");
    expect(inputSource).not.toContain(
      "if (imageGenerationSelected) {\n            onGenerateImage();"
    );
    expect(inputSource).toContain("onManualInputChange?.()");
    expect(chatSource).toContain('fetch("/api/images/intent"');
    expect(chatSource).toContain(
      'resolution.intent === "image_edit" && latestAssistantImageUrl'
    );
    expect(imageRouteSource).toContain("verifyImageIntentToken");
    expect(imageRouteSource).toContain("classifyImageIntent");
    expect(imageRouteSource.indexOf("signedDecisionIsValid")).toBeLessThan(
      imageRouteSource.indexOf("await deductImageCredits")
    );
  });
});
