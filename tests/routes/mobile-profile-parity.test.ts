import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const root = process.cwd();

async function source(relativePath: string) {
  return readFile(path.join(root, relativePath), "utf8");
}

test.describe("mobile profile parity", () => {
  test("keeps deletion requests distinct from account deactivation", async () => {
    const [deletionRoute, deactivationRoute] = await Promise.all([
      source("app/api/mobile/profile/deletion-request/route.ts"),
      source("app/api/mobile/profile/deactivate/route.ts"),
    ]);

    expect(deletionRoute).toContain("createAccountDeletionRequestRecord");
    expect(deletionRoute).toContain("account-deletion:user:");
    expect(deletionRoute).toContain('requestSource: "native_authenticated"');
    expect(deletionRoute).toContain('requireEmailVerification: false');
    expect(deactivationRoute).toContain("updateUserActiveState");
    expect(deactivationRoute).not.toContain("createAccountDeletionRequestRecord");
  });

  test("requires an authenticated mobile session and both permanent acknowledgements", async () => {
    const deletionRoute = await source(
      "app/api/mobile/profile/deletion-request/route.ts"
    );

    expect(deletionRoute).toContain("getMobileSession(request)");
    expect(deletionRoute).toContain('new ChatSDKError("unauthorized:api")');
    expect(deletionRoute).toContain("dataAcknowledge: z.literal(true)");
    expect(deletionRoute).toContain("permanentAcknowledge: z.literal(true)");
  });
});
