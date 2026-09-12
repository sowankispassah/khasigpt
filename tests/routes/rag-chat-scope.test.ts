import { expect, test } from "@playwright/test";
import {
  getRagChatScope,
  isDefaultChatRagScope,
  normalizeRagChatScope,
} from "@/lib/rag/chat-scope";

test.describe("rag chat scope", () => {
  test("normalizes valid scope values", () => {
    expect(normalizeRagChatScope("default")).toBe("default");
    expect(normalizeRagChatScope("shared")).toBe("shared");
    expect(normalizeRagChatScope(" jobs ")).toBe("jobs");
  });

  test("returns null for invalid or missing scope values", () => {
    expect(normalizeRagChatScope("")).toBeNull();
    expect(normalizeRagChatScope("legacy")).toBeNull();
    expect(getRagChatScope({})).toBeNull();
  });

  test("treats only default and shared scopes as eligible for default chat rag", () => {
    expect(isDefaultChatRagScope({ chatScope: "default" })).toBe(true);
    expect(isDefaultChatRagScope({ chatScope: "shared" })).toBe(true);
    expect(isDefaultChatRagScope({ chatScope: "jobs" })).toBe(false);
    expect(isDefaultChatRagScope({ chatScope: "study" })).toBe(false);
    expect(isDefaultChatRagScope({})).toBe(false);
  });
});
