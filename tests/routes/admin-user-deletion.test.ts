import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test.describe("admin user deletion", () => {
  test("authorizes and validates both deletion modes on the server", async () => {
    const source = await readWorkspaceFile(
      "app/api/admin/users/[id]/route.ts"
    );

    expect(source).toContain("export async function DELETE(");
    expect(source).toContain("requireAdminApiUser(request)");
    expect(source).toContain("self_delete_not_allowed");
    expect(source).toContain("invalid_delete_mode");
    expect(source).toContain("permanent_delete_confirmation_required");
    expect(source).toContain("deleteUserForAdmin({ id: userId, mode })");
    expect(source).toContain('action:');
    expect(source).toContain('"user.permanent_delete"');
  });

  test("deletes legacy dependent rows before the User row in one transaction", async () => {
    const source = await readWorkspaceFile("lib/db/queries.ts");
    const start = source.indexOf("export async function deleteUserForAdmin");
    expect(start).toBeGreaterThanOrEqual(0);
    const deletionSource = source.slice(start, source.indexOf(
      "export async function updateUserAuthProvider",
      start
    ));

    expect(deletionSource).toContain('mode === "soft"');
    expect(deletionSource).toContain("db.transaction");
    expect(deletionSource).toContain('DELETE FROM "Vote"');
    expect(deletionSource).toContain('DELETE FROM "Message_v2"');
    expect(deletionSource).toContain('DELETE FROM "Document"');
    expect(deletionSource).toContain('DELETE FROM "Chat"');
    expect(deletionSource).toContain("accountDeletionRequest");
    expect(deletionSource).toContain("auditLog.actorId");
    expect(deletionSource).toContain(".delete(user)");
  });

  test("exposes an acknowledged soft or permanent choice in the admin UI", async () => {
    const [menuSource, dialogSource, definitionsSource] = await Promise.all([
      readWorkspaceFile("components/admin-user-actions-menu.tsx"),
      readWorkspaceFile("components/admin-user-delete-dialog.tsx"),
      readWorkspaceFile("lib/i18n/static-definitions.ts"),
    ]);

    expect(menuSource).toContain("<AdminUserDeleteDialog");
    expect(menuSource).toContain('translationKey="admin.users.delete.title"');
    expect(dialogSource).toContain('method: "DELETE"');
    expect(dialogSource).toContain('defaultText="Soft delete"');
    expect(dialogSource).toContain('defaultText="Permanent delete"');
    expect(dialogSource).toContain("permanentConfirmed");
    expect(dialogSource).toContain('"PERMANENT_DELETE"');
    expect(definitionsSource).toContain(
      'key: "admin.users.delete.permanent.acknowledgement"'
    );
  });
});
