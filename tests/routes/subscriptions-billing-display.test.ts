import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test.describe("subscription billing display", () => {
  test("uses settled billable credit charges for usage displays", async () => {
    const [queries, page, mobileRoute] = await Promise.all([
      readWorkspaceFile("lib/db/queries.ts"),
      readWorkspaceFile("app/(chat)/subscriptions/page.tsx"),
      readWorkspaceFile("app/api/mobile/subscriptions/route.ts"),
    ]);

    expect(queries).toContain("billableCreditUnits");
    expect(queries).toContain('eq(creditCharge.status, "settled")');
    expect(queries).toContain("creditCharge.creditUnits");
    expect(page).toContain("formatCredits(entry.billableCreditUnits)");
    expect(page).toContain(
      "credits: entry.billableCreditUnits / TOKENS_PER_CREDIT"
    );
    expect(page).not.toContain("formatCredits(entry.totalTokens)");
    expect(mobileRoute).toContain(
      "creditsUsed: entry.billableCreditUnits / TOKENS_PER_CREDIT"
    );
    expect(mobileRoute).toContain(
      "credits: entry.billableCreditUnits / TOKENS_PER_CREDIT"
    );
  });
});
