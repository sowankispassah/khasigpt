import { expect, test } from "@playwright/test";
import { safeAiErrorDiagnostics } from "../../lib/ai/error-diagnostics";

test("AI diagnostics omit private request bodies, image bytes, tokens and error messages", () => {
  const error = Object.assign(new Error("Invalid image data with private-token and private-prompt"), {
    name: "AI_APICallError", statusCode: 400, requestBodyValues: { image: "private-image-base64", apiKey: "private-api-key" },
    responseBody: "private-response", url: "https://example.test/private-token",
  });
  expect(safeAiErrorDiagnostics(error)).toEqual({ name: "AI_APICallError", statusCode: 400, category: "image-input" });
  expect(JSON.stringify(safeAiErrorDiagnostics(error))).not.toContain("private");
});

test("untrusted diagnostic names and status fields cannot enter logs", () => {
  expect(safeAiErrorDiagnostics({ name: "private-token", statusCode: "private-token", message: "private-prompt" })).toEqual({ name: "UnknownError", statusCode: undefined, category: "generation" });
  expect(safeAiErrorDiagnostics(null).name).toBe("UnknownError");
});
