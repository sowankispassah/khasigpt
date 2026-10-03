import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test.describe("prelaunch invite assignment guardrails", () => {
  test("enforces assigned invite emails in every redemption path", async () => {
    const queries = await readWorkspaceFile("lib/db/queries.ts");
    expect(queries).toContain('{ status: "assigned_elsewhere" }');
    expect(queries).toContain(
      "assignedToEmail !== normalizedUserEmail"
    );
    expect(queries).toContain(
      ".innerJoin(inviteToken, eq(userInviteAccess.inviteId, inviteToken.id))"
    );

    const webInviteRoute = await readWorkspaceFile(
      "app/invite/[token]/route.ts"
    );
    expect(webInviteRoute).toContain("userEmail: session.user.email");

    const mobileInviteRoute = await readWorkspaceFile(
      "app/api/mobile/auth/invite-access/route.ts"
    );
    expect(mobileInviteRoute).toContain("userEmail: session.user.email");

    const auth = await readWorkspaceFile("app/(auth)/auth.ts");
    expect(auth).toContain("await applyPendingInviteAccess(user.id, user.email)");
  });

  test("keeps site access and prelaunch invites visible on settings entry", async () => {
    const settings = await readWorkspaceFile(
      "app/(admin)/admin/settings/page.tsx"
    );
    expect(settings).toContain('id="prelaunch-access"');
    expect(settings).toContain("defaultOpen");
    expect(settings).toContain("<PrelaunchInvitesPanel");
  });
});
