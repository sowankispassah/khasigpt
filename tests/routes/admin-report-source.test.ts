import { expect, test } from "@playwright/test";
import { reportSourceFromSubject } from "@/lib/admin/report-source";

test("report type filter covers forum, chat safety, chat feedback, and other reports", () => {
  expect(reportSourceFromSubject("Forum content report")).toBe("forum");
  expect(reportSourceFromSubject("AI content report")).toBe("chat");
  expect(reportSourceFromSubject("AI response feedback")).toBe("chat");
  expect(reportSourceFromSubject("Custom report")).toBe("other");
});
