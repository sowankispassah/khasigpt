import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  hasUsableChatCredits,
  isFreeDailyChatLimitBypassedForTest,
  isRoleDailyChatLimitReached,
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

  test("does not apply a daily message cap while credits remain", () => {
    expect(
      isRoleDailyChatLimitReached({
        hasActiveCredits: true,
        maxMessagesPerDay: 100,
        messageCount: 100,
      })
    ).toBe(false);
    expect(
      isRoleDailyChatLimitReached({
        hasActiveCredits: false,
        maxMessagesPerDay: 100,
        messageCount: 100,
      })
    ).toBe(true);
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
    const [
      route,
      exploreRoute,
      adminForm,
      adminPage,
      staticDefinitions,
      webSearchConfig,
      databaseQueries,
      subscriptionsPage,
      mobileSubscriptionsRoute,
    ] = await Promise.all([
      readFile(
        path.join(process.cwd(), "app/(chat)/api/chat/route.ts"),
        "utf8"
      ),
      readFile(
        path.join(process.cwd(), "app/api/explore/search/route.ts"),
        "utf8"
      ),
      readFile(
        path.join(
          process.cwd(),
          "app/(admin)/admin/settings/web-search-settings-form.tsx"
        ),
        "utf8"
      ),
      readFile(
        path.join(process.cwd(), "app/(admin)/admin/settings/page.tsx"),
        "utf8"
      ),
      readFile(
        path.join(process.cwd(), "lib/i18n/static-definitions.ts"),
        "utf8"
      ),
      readFile(
        path.join(process.cwd(), "lib/web-search/config.ts"),
        "utf8"
      ),
      readFile(path.join(process.cwd(), "lib/db/queries.ts"), "utf8"),
      readFile(
        path.join(process.cwd(), "app/(chat)/subscriptions/page.tsx"),
        "utf8"
      ),
      readFile(
        path.join(process.cwd(), "app/api/mobile/subscriptions/route.ts"),
        "utf8"
      ),
    ]);
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
    expect(route).toContain("isRoleDailyChatLimitReached({");
    expect(route).toContain("isPaidUser: hasActiveCredits");
    expect(route).not.toContain("activePlanIsPaid");
    expect(route).not.toContain('measurePreModelStep("get_active_plan"');
    expect(route).not.toContain("getWebSearchUsageCountSince");
    expect(route).not.toContain("webSearchConfig.dailyLimit");

    expect(exploreRoute).toContain("consumeFreeDailyChatAllowance");
    expect(exploreRoute).not.toContain("getWebSearchUsageCountSince");
    expect(exploreRoute).not.toContain("config.dailyLimit");

    expect(adminForm).not.toContain("dailyLimit");
    expect(adminPage).not.toContain("daily search limits");
    expect(adminPage).toContain('translationKey="admin.web_search.section_description"');
    expect(staticDefinitions).toContain('key: "admin.web_search.section_description"');
    expect(webSearchConfig).not.toContain("WEB_SEARCH_DAILY_LIMIT_SETTING_KEY");

    const creditReadStart = databaseQueries.indexOf(
      "async function getActiveSubscriptionReadOnly"
    );
    const creditWriteStart = databaseQueries.indexOf(
      "async function getActiveSubscriptionInternal",
      creditReadStart
    );
    const creditReadBlock = databaseQueries.slice(
      creditReadStart,
      creditWriteStart
    );
    const creditWriteEnd = databaseQueries.indexOf(
      "function calculateTokenDeduction",
      creditWriteStart
    );
    const creditWriteBlock = databaseQueries.slice(
      creditWriteStart,
      creditWriteEnd
    );

    expect(creditReadBlock).toContain("gt(userSubscription.tokenBalance, 0)");
    expect(creditReadBlock).not.toContain('eq(userSubscription.status, "active")');
    expect(creditReadBlock).not.toContain("gt(userSubscription.expiresAt");
    expect(creditWriteBlock).toContain("gt(userSubscription.tokenBalance, 0)");
    expect(creditWriteBlock).not.toContain('eq(userSubscription.status, "active")');
    expect(creditWriteBlock).not.toContain("gt(userSubscription.expiresAt");
    expect(databaseQueries).toContain("mergeUsableCreditSubscriptions");
    expect(databaseQueries).toContain(
      "Capping the final charge at the remaining wallet balance"
    );
    expect(databaseQueries).not.toContain("let exhausted = false");
    expect(subscriptionsPage).toContain(
      "const effectiveCreditsRemaining = balance.creditsRemaining"
    );
    expect(subscriptionsPage).not.toContain("isExpiredBalance ? 0");
    expect(mobileSubscriptionsRoute).toContain(
      "const effectiveCreditsRemaining = balance.creditsRemaining"
    );
    expect(mobileSubscriptionsRoute).not.toContain("isExpiredBalance ? 0");
  });
});
