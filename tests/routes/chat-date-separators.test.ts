import { expect, test } from "@playwright/test";
import { formatMessageDateSeparator, getMessageDateSeparators, parseMessageDate } from "../../lib/chat/date-separators";
import { resolveSavedMessageTimestamp } from "../../lib/chat/saved-message-timestamp";

const message = (id: string, createdAt: string) => ({ id, metadata: { createdAt } });

test("history and appended replies have one marker per local calendar day", () => {
  const history = [
    message("user-1", "2026-09-30T18:40:00Z"),
    message("assistant-1", "2026-09-30T18:41:00Z"),
    message("user-2", "2026-10-01T07:00:00Z"),
    message("assistant-2", "2026-10-01T07:01:00Z"),
  ];
  expect([...getMessageDateSeparators(history, "Asia/Kolkata").keys()]).toEqual(["user-1"]);
  history.push(message("user-3", "2026-10-02T06:05:00Z"));
  history.push(message("assistant-3", "2026-10-02T06:06:00Z"));
  expect([...getMessageDateSeparators(history, "Asia/Kolkata").keys()]).toEqual(["user-1", "user-3"]);
});

test("users in different timezones group the same saved instants differently", () => {
  const history = [message("a", "2026-10-01T18:20:00Z"), message("b", "2026-10-01T18:40:00Z")];
  expect(getMessageDateSeparators(history, "Asia/Kolkata").size).toBe(2);
  expect(getMessageDateSeparators(history, "America/New_York").size).toBe(1);
});

test("relative labels and old dates use the first message time, never the open time", () => {
  const now = new Date("2026-10-03T09:00:00Z");
  const today = formatMessageDateSeparator(new Date("2026-10-03T10:40:00Z"), now, "Asia/Kolkata");
  const yesterday = formatMessageDateSeparator(new Date("2026-10-02T10:40:00Z"), now, "Asia/Kolkata");
  const older = formatMessageDateSeparator(new Date("2026-10-01T10:40:00Z"), now, "Asia/Kolkata");
  expect(today).toMatchObject({ kind: "today", time: "4:10 PM" });
  expect(yesterday).toMatchObject({ kind: "yesterday", time: "4:10 PM" });
  expect(older).toMatchObject({ kind: "date", calendarDate: "1 Oct 2026", time: "4:10 PM" });
});

for (const [name, saved, now] of [
  ["spring DST", "2026-03-08T05:10:00Z", "2026-03-09T04:05:00Z"],
  ["autumn DST", "2026-11-01T04:10:00Z", "2026-11-02T05:05:00Z"],
  ["new year", "2025-12-31T20:10:00Z", "2026-01-01T20:00:00Z"],
] as const) {
  test(`yesterday survives ${name}`, () => {
    expect(formatMessageDateSeparator(new Date(saved), new Date(now), "America/New_York").kind).toBe("yesterday");
  });
}

test("missing or malformed dates do not fabricate a timestamp or break valid history", () => {
  const history = [{ id: "missing" }, message("bad", "invalid"), message("a", "2026-10-01T10:40:00Z"), { id: "unknown" }, message("b", "2026-10-01T11:00:00Z")];
  expect([...getMessageDateSeparators(history, "UTC").keys()]).toEqual(["a"]);
  expect(parseMessageDate(undefined)).toBeNull();
  expect(parseMessageDate(0)).toBeNull();
  expect(parseMessageDate("")).toBeNull();
});

test("prepending history and rendering a window do not repeat markers within a day", () => {
  const history = [message("earlier", "2026-10-01T10:00:00Z"), message("a", "2026-10-01T10:40:00Z"), message("b", "2026-10-02T10:40:00Z")];
  const markers = getMessageDateSeparators(history, "UTC");
  expect(history.slice(1).filter((entry) => markers.has(entry.id)).map((entry) => entry.id)).toEqual(["b"]);
});

test("a streamed response crossing local midnight starts the next day", () => {
  expect([...getMessageDateSeparators([
    message("user", "2026-10-01T18:29:59Z"),
    message("assistant", "2026-10-01T18:30:01Z"),
    message("follow-up", "2026-10-01T18:31:00Z"),
  ], "Asia/Kolkata").keys()]).toEqual(["user", "assistant"]);
});

test("new writes acknowledge their saved time without an additional DB read", async () => {
  const createdAt = new Date("2026-10-01T10:40:00Z");
  const timestamp = await resolveSavedMessageTimestamp({
    inserted: [{ id: "user", createdAt }], messageId: "user", chatId: "chat", role: "user",
    findExisting: async () => { throw new Error("Unexpected lookup for a new insert"); },
  });
  expect(timestamp).toEqual({ id: "user", createdAt: createdAt.toISOString() });
});

test("a retry acknowledges the original saved date and checks ownership", async () => {
  const lookup = async () => [{ id: "user", chatId: "chat", role: "user", createdAt: new Date("2026-10-01T10:40:00Z") }];
  const options = { inserted: [], messageId: "user", chatId: "chat", role: "user", findExisting: lookup };
  expect(await resolveSavedMessageTimestamp(options)).toEqual({ id: "user", createdAt: "2026-10-01T10:40:00.000Z" });
  expect(await resolveSavedMessageTimestamp({ ...options, chatId: "another-chat" })).toBeNull();
  expect(await resolveSavedMessageTimestamp({ ...options, role: "assistant" })).toBeNull();
});
