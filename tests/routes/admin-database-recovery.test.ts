import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

function extractFunctionSource(source: string, functionName: string) {
  const startMarker = `export async function ${functionName}`;
  const start = source.indexOf(startMarker);
  expect(start, `${functionName} should exist`).toBeGreaterThanOrEqual(0);

  const next = source.indexOf("\nexport async function ", start + startMarker.length);
  return source.slice(start, next === -1 ? undefined : next);
}

test.describe("admin database recovery", () => {
  test("preflights and recycles stale serverless database connections", async () => {
    const source = await readWorkspaceFile("lib/db/admin-database.ts");

    expect(source).toContain('client`SELECT 1 AS "healthy"`');
    expect(source).toContain("recycleAdminDatabase(checkedState)");
    expect(source).toContain("POSTGRES_ADMIN_HEALTH_TIMEOUT_MS");
    expect(source).toContain("POSTGRES_ADMIN_OPERATION_TIMEOUT_MS");
    expect(source).toContain("recoverable && retry && attempt === 1");
    expect(source).toContain("expectedState.client.end({ timeout: 0 })");
  });

  test("isolates high-traffic admin reads from the shared app pool", async () => {
    const source = await readWorkspaceFile("lib/db/queries.ts");
    const functionNames = [
      "getAdminOverviewSnapshot",
      "getAdminUsersSnapshot",
      "getChatCount",
      "getAuditLogCount",
      "getAccountDeletionRequestCount",
      "getContactMessageCount",
      "getUnviewedAccountDeletionRequestCount",
      "getUserBalanceSummaries",
      "listActiveSubscriptionSummaries",
      "listChats",
      "listAuditLog",
      "listAccountDeletionRequests",
      "listContactMessages",
    ];

    for (const functionName of functionNames) {
      expect(extractFunctionSource(source, functionName)).toContain(
        "withAdminDatabase("
      );
    }

    const grantSource = extractFunctionSource(source, "grantUserCredits");
    expect(grantSource).toContain('"users.grant-credits"');
    expect(grantSource).toContain("{ retry: false }");
  });

  test("streams optional user sections after one compact primary snapshot", async () => {
    const source = await readWorkspaceFile(
      "app/(admin)/admin/users/page.tsx"
    );

    expect(source).toContain("getAdminUsersSnapshot({");
    expect(source).not.toContain("getUserCount(");
    expect(source).not.toContain("listUsers({");
    expect(source).not.toContain("<AdminPagination");
    expect(source).toContain("<AdminUsersTable");
    expect(source).toContain("lastLoginAt");
    expect(source).toContain('search={search ?? ""}');
    expect(source).toContain("balanceByUserIdStatePromise");
    expect(source).toContain("activeSubscriptionsStatePromise");
    expect(source).toContain("<UserCreditAction");
    expect(source).toContain("creditsRemaining={null}");
    expect(source).toContain(
      "<Suspense fallback={<SubscriptionsFallback />}>"
    );
  });

  test("keeps user search and appended loading on the admin users surface", async () => {
    const [pageSource, tableSource, querySource] = await Promise.all([
      readWorkspaceFile("app/(admin)/admin/users/page.tsx"),
      readWorkspaceFile("app/(admin)/admin/users/admin-users-table.tsx"),
      readWorkspaceFile("lib/db/queries.ts"),
    ]);

    expect(pageSource).toContain("search,");
    expect(tableSource).toContain("/api/admin/users?");
    expect(tableSource).toContain("setLoadedUsers((current) => [");
    expect(tableSource).toContain('defaultText="Load more"');
    expect(querySource).toContain(
      'action" IN (\'user.login\', \'user.signup\')'
    );
    expect(querySource).toContain('search?: string | null');
  });

  test("supports online presence, role/status filters, and stable user sorting", async () => {
    const [pageSource, tableSource, apiSource, querySource, trackerSource] =
      await Promise.all([
        readWorkspaceFile("app/(admin)/admin/users/page.tsx"),
        readWorkspaceFile("app/(admin)/admin/users/admin-users-table.tsx"),
        readWorkspaceFile("app/api/admin/[section]/route.ts"),
        readWorkspaceFile("lib/db/queries.ts"),
        readWorkspaceFile("components/user-presence-tracker.tsx"),
      ]);

    expect(pageSource).toContain('parsePresence(resolvedSearchParams?.presence)');
    expect(pageSource).toContain('parseSort(resolvedSearchParams?.sort)');
    expect(pageSource).toContain('defaultText="Online"');
    expect(tableSource).toContain('id="admin-user-presence"');
    expect(tableSource).toContain('id="admin-user-sort"');
    expect(tableSource).toContain('params.set("presence", nextPresence)');
    expect(tableSource).toContain('params.set("sort", nextSort)');
    expect(tableSource).toContain("function applyFilters(");
    expect(tableSource).toContain("filtersRef.current = nextFilters");
    expect(tableSource).toContain("applyFilters({ role: nextRole })");
    expect(tableSource).toContain(
      "applyFilters({ accountStatus: nextAccountStatus })"
    );
    expect(tableSource).toContain("applyFilters({ presence: nextPresence })");
    expect(tableSource).toContain("applyFilters({ sort: nextSort })");
    expect(tableSource).toContain("router.replace(");
    expect(tableSource).toContain("{ scroll: false }");
    expect(apiSource).toContain("isAdminUserPresenceFilter");
    expect(apiSource).toContain("isAdminUserSortOption");
    expect(querySource).toContain('LEFT JOIN "UserPresence"');
    expect(querySource).toContain("NOW() - INTERVAL '5 minutes'");
    expect(querySource).toContain('case "online_first"');
    expect(querySource).toContain("user.login', 'user.signup");
    expect(trackerSource).toContain("return Boolean(pathname)");
  });

  test("normalizes filtered user dates and keeps section retry actionable", async () => {
    const [querySource, errorSource] = await Promise.all([
      readWorkspaceFile("lib/db/queries.ts"),
      readWorkspaceFile("components/admin/admin-section-error.tsx"),
    ]);

    expect(querySource).toContain("const rows = await query");
    expect(querySource).toContain("return normalizeAdminUsers(rows);");
    expect(errorSource).toContain("useTransition");
    expect(errorSource).toContain("onClick={() => startRetry(reset)}");
    expect(errorSource).toContain("disabled={isRetrying}");
    expect(errorSource).toContain('translationKey="admin.section.error.retry"');
    expect(errorSource).toContain(
      'translationKey="admin.section.error.retrying"'
    );
  });

  test("does not block the shared admin shell on an optional badge query", async () => {
    const [layoutSource, navSource] = await Promise.all([
      readWorkspaceFile("app/(admin)/admin/layout.tsx"),
      readWorkspaceFile("components/admin-nav.tsx"),
    ]);

    expect(layoutSource).not.toContain(
      "getUnviewedAccountDeletionRequestCount"
    );
    expect(layoutSource).toContain("<AdminNav />");
    expect(navSource).toContain("void refreshDeletionRequestCount();");
  });

  test("uses short-lived shared pooler sockets as a secondary safeguard", async () => {
    const source = await readWorkspaceFile("lib/db/queries.ts");

    expect(source).toContain("usesSupabasePooler ? 5 : 20");
    expect(source).toContain("usesSupabasePooler ? 60 * 5 : 60 * 30");
    expect(source).toContain("configuredPoolerUrl && isSupabasePoolerUrl");
  });
});
