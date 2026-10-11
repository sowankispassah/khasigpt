import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { adminUserRecentChatOrderBy } from "@/lib/db/admin-user-chat-sort";
import { user } from "@/lib/db/schema";

test("recent chat sorts by sent messages with an indexed lookup and stable pagination", () => {
  const query = new PgDialect().sqlToQuery(sql`
    SELECT ${user.id} FROM ${user}
    ORDER BY ${sql.join(adminUserRecentChatOrderBy(), sql`, `)}
    LIMIT ${25} OFFSET ${25}
  `);

  expect(query.sql).toContain('WHERE c."userId" = "User"."id"');
  expect(query.sql).toContain('WHERE m."chatId" = c."id" AND m."role" = \'user\'');
  expect(query.sql).toContain('ORDER BY m."createdAt" DESC');
  expect(query.sql).toContain("LIMIT 1");
  expect(query.sql).toContain('DESC NULLS LAST, "User"."createdAt" desc, "User"."id" desc');
  expect(query.params).toEqual([25, 25]);
});

test("recent chat is accepted by the shared server sort guard and translated in the filter", async () => {
  const [queries, table, translations] = await Promise.all([
    readFile("lib/db/queries.ts", "utf8"),
    readFile("app/(admin)/admin/users/admin-users-table.tsx", "utf8"),
    readFile("lib/i18n/static-definitions.ts", "utf8"),
  ]);

  expect(queries).toContain('value === "recent_chat"');
  expect(queries).toContain('case "recent_chat":');
  expect(queries).toContain("return adminUserRecentChatOrderBy();");
  expect(table).toContain('<option value="recent_chat">');
  expect(table).toContain("{recentChatLabel}");
  expect(table).toContain('{sort === "recent_chat" ? recentChatEditButton : null}');
  expect(translations).toContain('key: "admin.users.filters.sort.recent_chat"');
});
