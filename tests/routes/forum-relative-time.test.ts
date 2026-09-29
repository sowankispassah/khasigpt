import { expect, test } from "@playwright/test";
import { formatForumRelativeTime } from "@/lib/forum/relative-time";

const NOW = Date.UTC(2026, 8, 29);
const DAY = 24 * 60 * 60 * 1_000;

function ago(duration: number) {
  return new Date(NOW - duration).toISOString();
}

test("forum activity uses the actual elapsed time for each unit", () => {
  expect(formatForumRelativeTime(ago(2 * 60 * 1_000), "en", "just now", NOW))
    .toBe("2 minutes ago");
  expect(formatForumRelativeTime(ago(3 * 60 * 60 * 1_000), "en", "just now", NOW))
    .toBe("3 hours ago");
  expect(formatForumRelativeTime(ago(2 * DAY), "en", "just now", NOW))
    .toBe("2 days ago");
  expect(formatForumRelativeTime(ago(2 * 7 * DAY), "en", "just now", NOW))
    .toBe("2 weeks ago");
  expect(formatForumRelativeTime(ago(3 * 30.4375 * DAY), "en", "just now", NOW))
    .toBe("3 months ago");
  expect(formatForumRelativeTime(ago(2 * 365.25 * DAY), "en", "just now", NOW))
    .toBe("2 years ago");
});

test("forum activity handles future and invalid timestamps", () => {
  expect(formatForumRelativeTime(new Date(NOW + 2 * DAY).toISOString(), "en", "just now", NOW))
    .toBe("in 2 days");
  expect(formatForumRelativeTime("invalid", "en", "just now", NOW)).toBe("just now");
  expect(formatForumRelativeTime(null, "en", "just now", NOW)).toBe("just now");
});
