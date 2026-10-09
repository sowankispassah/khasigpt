import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import * as forumUtils from "@/lib/forum/utils";

const requireModule = createRequire(path.join(process.cwd(), "package.json"));
const PRIVATE_EMAIL = "private.person@example.com";
const USER_EMAIL_COLUMN = /^user(~[^.]+)?\.email$/;

// Each schema table is a proxy whose columns are named strings, so the test can
// see exactly which user columns the forum queries ask the database for.
function table(name: string): any {
  return new Proxy(
    {},
    { get: (_target, prop) => (prop === "__name" ? name : `${name}.${String(prop)}`) }
  );
}

function rowsFor(projection: Record<string, unknown>) {
  const dates = {
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
  };
  if ("title" in projection && "authorFirstName" in projection) {
    return [{
      id: "thread-1", slug: "hello", title: "Hello", summary: "Summary", status: "open",
      isPinned: false, isLocked: false, totalReplies: 1, viewCount: 3, ...dates,
      lastRepliedAt: dates.updatedAt, categoryId: "cat-1", categorySlug: "general",
      categoryName: "General", authorId: "author-1", authorFirstName: null,
      authorLastName: null, authorEmail: PRIVATE_EMAIL, authorImage: null,
      authorRole: "regular", lastReplyUserId: "replier-1", lastReplyFirstName: "  ",
      lastReplyLastName: null, lastReplyEmail: PRIVATE_EMAIL, lastReplyImage: null,
      lastReplyRole: null,
    }];
  }
  if ("content" in projection && "authorFirstName" in projection) {
    return [{
      id: "post-1", threadId: "thread-1", authorId: "replier-1", authorFirstName: null,
      authorLastName: null, authorEmail: PRIVATE_EMAIL, authorImage: null,
      authorRole: null, content: "First reply", isEdited: false, isDeleted: false,
      ...dates, parentPostId: null,
    }];
  }
  if ("firstName" in projection) {
    return [{ id: "blocked-1", firstName: null, lastName: null, email: PRIVATE_EMAIL }];
  }
  return [];
}

function serviceHarness() {
  const projections: Record<string, unknown>[] = [];
  const chain = (rows: unknown[]): any => {
    const proxy: any = new Proxy(() => undefined, {
      get: (_target, prop) =>
        prop === "then"
          ? (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
              Promise.resolve(rows).then(resolve, reject)
          : () => proxy,
    });
    return proxy;
  };
  const exports: Record<string, any> = {};
  const passthrough = (...args: unknown[]) => ({ args });
  const mocks: Record<string, unknown> = {
    "server-only": {},
    "drizzle-orm": {
      and: passthrough, asc: passthrough, count: passthrough, desc: passthrough,
      eq: passthrough, inArray: passthrough, sql: passthrough,
    },
    "drizzle-orm/pg-core": {
      alias: (source: any, name: string) => table(`${source.__name}~${name}`),
    },
    "@/lib/db/queries": {
      db: {
        select: (projection: Record<string, unknown> = {}) => {
          projections.push(projection);
          return chain(rowsFor(projection));
        },
      },
    },
    "@/lib/db/schema": new Proxy({}, { get: (_target, prop) => table(String(prop)) }),
    "@/lib/errors": { ChatSDKError: class ChatSDKError extends Error {} },
    "@/lib/i18n/dictionary": { registerTranslationKeys: async () => undefined },
    "./utils": forumUtils,
  };
  const code = ts.transpileModule(readFileSync("lib/forum/service.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (name: string) => (name in mocks ? mocks[name] : requireModule(name)),
  });
  return { service: exports, projections };
}

function expectPublicForumUser(user: Record<string, unknown>) {
  expect(Object.keys(user)).not.toContain("email");
  expect(user.displayName).toBe(forumUtils.FORUM_USER_FALLBACK_NAME);
}

test("forum display names never fall back to an email address", () => {
  expect(forumUtils.formatForumUserName(" Ka ", " Bah ")).toBe("Ka Bah");
  for (const [first, last] of [[null, null], ["", "  "], [undefined, undefined]]) {
    const name = forumUtils.formatForumUserName(first, last);
    expect(name).toBe("Community member");
    expect(name).not.toContain("@");
  }
});

test("public forum reads never select or return other users' emails", async () => {
  const { service, projections } = serviceHarness();
  const overview = await service.getForumOverview({});
  const detail = await service.getForumThreadDetail({ slug: "hello", viewerUserId: null });
  const blocked = await service.listForumBlockedUsers("viewer-1");

  expect(projections.length).toBeGreaterThan(0);
  for (const projection of projections) {
    for (const value of Object.values(projection)) {
      expect(typeof value === "string" && USER_EMAIL_COLUMN.test(value)).toBe(false);
    }
  }

  expectPublicForumUser(overview.threads[0].author);
  expectPublicForumUser(overview.threads[0].lastResponder);
  expectPublicForumUser(detail.thread.author);
  expectPublicForumUser(detail.thread.lastResponder);
  expectPublicForumUser(detail.posts[0].author);
  expect(blocked).toEqual([{ id: "blocked-1", displayName: "Community member" }]);
  for (const payload of [overview, detail, blocked]) {
    expect(JSON.stringify(payload)).not.toContain("@");
  }
});

test("forum UI does not read an email from other users' summaries", () => {
  const source = readFileSync("components/forum/thread-detail-client.tsx", "utf8");
  expect(source).not.toMatch(/\b(user|author|lastResponder|authorSummary)\.email\b/);
  expect(readFileSync("lib/forum/types.ts", "utf8")).not.toMatch(/\bemail\b/);
});
