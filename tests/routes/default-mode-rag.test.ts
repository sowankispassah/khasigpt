import { expect, test } from "@playwright/test";
import { shouldUseDefaultModeRag } from "@/lib/chat/default-mode-rag";

test.describe("default mode rag gating", () => {
  test("bypasses rag for short social messages", () => {
    expect(
      shouldUseDefaultModeRag({
        userText: "Hi",
        hasDocumentContext: false,
        hasHiddenPrompt: false,
      })
    ).toBe(false);

    expect(
      shouldUseDefaultModeRag({
        userText: "hello",
        hasDocumentContext: false,
        hasHiddenPrompt: false,
      })
    ).toBe(false);

    expect(
      shouldUseDefaultModeRag({
        userText: "thanks",
        hasDocumentContext: false,
        hasHiddenPrompt: false,
      })
    ).toBe(false);
  });

  test("uses rag for product and knowledge lookup queries", () => {
    expect(
      shouldUseDefaultModeRag({
        userText: "What is your pricing for paid plans?",
        hasDocumentContext: false,
        hasHiddenPrompt: false,
      })
    ).toBe(true);

    expect(
      shouldUseDefaultModeRag({
        userText: "How do document uploads work in the app?",
        hasDocumentContext: false,
        hasHiddenPrompt: false,
      })
    ).toBe(true);
  });

  test("uses rag when document context or hidden prompt is present", () => {
    expect(
      shouldUseDefaultModeRag({
        userText: "Summarize this for me",
        hasDocumentContext: true,
        hasHiddenPrompt: false,
      })
    ).toBe(true);

    expect(
      shouldUseDefaultModeRag({
        userText: "Rewrite this",
        hasDocumentContext: false,
        hasHiddenPrompt: true,
      })
    ).toBe(true);
  });

  test("defaults to no rag when the query is neither social nor a knowledge lookup", () => {
    expect(
      shouldUseDefaultModeRag({
        userText: "Write a haiku about the sea",
        hasDocumentContext: false,
        hasHiddenPrompt: false,
      })
    ).toBe(false);
  });
});
