import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test.describe("admin bulk user deletion", () => {
  test("validates the selected IDs and reuses the server authorization boundary", async () => {
    const source = await readWorkspaceFile(
      "app/api/admin/users/bulk/route.ts"
    );

    expect(source).toContain("export async function DELETE(request: NextRequest)");
    expect(source).toContain("requireAdminApiUser(request)");
    expect(source).toContain("MAX_BULK_USER_DELETE_COUNT");
    expect(source).toContain("invalid_user_ids");
    expect(source).toContain("self_delete_not_allowed");
    expect(source).toContain("permanent_delete_confirmation_required");
    expect(source).toContain(
      "deleteUsersForAdmin({ ids: userIds, mode })"
    );
  });

  test("keeps the batch mutation transactional", async () => {
    const source = await readWorkspaceFile("lib/db/queries.ts");
    const start = source.indexOf("export async function deleteUsersForAdmin");
    expect(start).toBeGreaterThanOrEqual(0);
    const deletionSource = source.slice(
      start,
      source.indexOf("export async function updateUserAuthProvider", start)
    );

    expect(deletionSource).toContain("db.transaction");
    expect(deletionSource).toContain("inArray(user.id, uniqueIds)");
    expect(deletionSource).toContain(
      "deleteUserPermanentlyInTransaction(tx, id)"
    );
    expect(deletionSource).toContain("userIds: deletedUserIds");
  });

  test("deletes bulk selections one user at a time with visible progress", async () => {
    const source = await readWorkspaceFile(
      "components/admin-user-delete-dialog.tsx"
    );

    expect(source).toContain(
      "for (const [index, targetId] of deletionTargets.entries())"
    );
    expect(source).toContain("await deleteUser(targetId)");
    expect(source).toContain("<Progress");
    expect(source).toContain("admin.users.delete.progress");
    expect(source).not.toContain('bulk ? "/api/admin/users/bulk"');
  });

  test("scopes selection to visible rows and resets it with the page/search scope", async () => {
    const [pageSource, tableSource, selectionSource] = await Promise.all([
      readWorkspaceFile("app/(admin)/admin/users/page.tsx"),
      readWorkspaceFile("app/(admin)/admin/users/admin-users-table.tsx"),
      readWorkspaceFile("components/admin-users-selection.tsx"),
    ]);

    expect(pageSource).toContain("<AdminUsersSelectionProvider");
    expect(pageSource).toContain("<AdminUsersBulkDeleteButton />");
    expect(pageSource).toContain("<AdminUsersSelectionCheckbox");
    expect(tableSource).toContain("<AdminUsersSelectAllCheckbox />");
    expect(tableSource).toContain("<AdminUsersBulkActionBar />");
    expect(selectionSource).toContain("setSelectedUserIds(new Set())");
    expect(selectionSource).toContain("isBulkDeleteMode");
    expect(selectionSource).toContain("toggleBulkDeleteMode");
    expect(selectionSource).toContain("setIsBulkDeleteMode(false)");
    expect(selectionSource).toContain("userId !== currentUserId");
    expect(selectionSource).toContain("toggleSelectAllVisibleUsers");
  });
});
