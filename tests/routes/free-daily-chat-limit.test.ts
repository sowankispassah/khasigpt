import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  hasUsableChatCredits,
  isFreeDailyChatLimitBypassedForTest,
  requiresPaidWebSearchCredits,
} from "@/lib/chat/free-daily-limit";

test.describe("shared free daily chat allowance", () => {
  test("never permits the test bypass in production", () => {
    expect(
      isFreeDailyChatLimitBypassedForTest({
        nodeEnv: "production",
        playwright: "true",
      })
    ).toBe(false);
    expect(
      isFreeDailyChatLimitBypassedForTest({
        nodeEnv: "development",
        playwright: "true",
      })
    ).toBe(true);
  });

  test("treats manually granted token balances as usable chat credits", () => {
    expect(hasUsableChatCredits(1000)).toBe(true);
    expect(hasUsableChatCredits(0)).toBe(false);
    expect(hasUsableChatCredits(Number.NaN)).toBe(false);
  });

  test("lets a free allowance cover normal or grounded chat before requiring credits", () => {
    expect(
      requiresPaidWebSearchCredits({
        activeTokenBalance: 0,
        hasActiveCredits: false,
        minimumCreditTokens: 300,
        testLimitBypass: false,
        usedFreeDailyAllowance: true,
      })
    ).toBe(false);
    expect(
      requiresPaidWebSearchCredits({
        activeTokenBalance: 0,
        hasActiveCredits: false,
        minimumCreditTokens: 300,
        testLimitBypass: false,
        usedFreeDailyAllowance: false,
      })
    ).toBe(true);
    expect(
      requiresPaidWebSearchCredits({
        activeTokenBalance: 300,
        hasActiveCredits: true,
        minimumCreditTokens: 300,
        testLimitBypass: false,
        usedFreeDailyAllowance: false,
      })
    ).toBe(false);
  });

  test("enforces the same server-side allowance for every role and chat mode", async () => {
    const route = await readFile(
      path.join(process.cwd(), "app/(chat)/api/chat/route.ts"),
      "utf8"
    );
    const allowanceStart = route.indexOf("const testLimitBypass");
    const featureAccessStart = route.indexOf(
      "const featureAccessUnavailable",
      allowanceStart
    );
    const allowanceBlock = route.slice(allowanceStart, featureAccessStart);

    expect(allowanceBlock).toContain("consumeFreeDailyChatAllowance");
    expect(allowanceBlock).toContain("usedFreeDailyAllowance = true");
    expect(allowanceBlock).not.toContain('userRole !== "admin"');
    expect(route).toContain("requiresPaidWebSearchCredits({");
    expect(route).toContain("hasUsableChatCredits(activeTokenBalance)");
    expect(route).toContain("isPaidUser: hasActiveCredits");
    expect(route).not.toContain("activePlanIsPaid");
    expect(route).not.toContain('measurePreModelStep("get_active_plan"');
  });
});
