import { expect, test } from "@playwright/test";
import { mergeChatUiContext, readChatUiContext } from "@/lib/chat/ui-context";

test.describe("chat ui context helpers", () => {
  test("reads persisted job and study ids from lastContext", () => {
    const result = readChatUiContext({
      inputTokens: 10,
      uiContext: {
        jobPostingId: "job-123",
        studyPaperId: "paper-456",
      },
    });

    expect(result).toEqual({
      jobPostingId: "job-123",
      studyPaperId: "paper-456",
    });
  });

  test("merges usage data while updating only the selected job context", () => {
    const result = mergeChatUiContext({
      currentContext: {
        inputTokens: 9,
        outputTokens: 22,
        totalTokens: 31,
        uiContext: {
          jobPostingId: null,
          studyPaperId: "paper-456",
        },
      },
      usageContext: {
        inputTokens: 11,
      },
      uiContext: {
        jobPostingId: "job-123",
      },
    });

    expect(result.inputTokens).toBe(11);
    expect(result.outputTokens).toBe(22);
    expect(result.uiContext).toEqual({
      jobPostingId: "job-123",
      studyPaperId: "paper-456",
    });
  });
});
