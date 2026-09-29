import { expect, test } from "@playwright/test";
import { summarizeContactMessage } from "@/lib/admin/contact-message-summary";

test("forum reports expose a safe discussion link and useful review details", () => {
  const summary = summarizeContactMessage([
    "Target: post",
    "Reason: harassment",
    "User details: Repeated insults",
    "Reporter ID: 00000000-0000-0000-0000-000000000001",
    "Reported user: Example (00000000-0000-0000-0000-000000000002)",
    "Thread: An example (00000000-0000-0000-0000-000000000003)",
    "Post ID: 00000000-0000-0000-0000-000000000004",
    "Forum URL: https://khasigpt.com/forum/an-example",
    "Excerpt: Reported content",
  ].join("\n"));

  expect(summary.isForumReport).toBe(true);
  expect(summary.category).toBe("Forum post · harassment");
  expect(summary.details).toBe("Repeated insults");
  expect(summary.forumUrl).toBe("https://khasigpt.com/forum/an-example");
  expect(summary.excerpt).toBe("Reported content");
});

test("report links cannot point to an arbitrary site", () => {
  const summary = summarizeContactMessage([
    "Target: user",
    "Reason: spam",
    "Forum URL: https://example.com/forum/fake",
  ].join("\n"));
  expect(summary.forumUrl).toBeNull();
  expect(summary.isForumReport).toBe(false);
});
