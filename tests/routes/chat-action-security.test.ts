import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import { z } from "zod";
import { ChatSDKError } from "@/lib/errors";

const id = "11111111-1111-4111-8111-111111111111";
function harness() {
  const state = {
    user: "owner" as string | null,
    owner: "owner",
    chatExists: true,
    messageExists: true,
    allowed: true,
    unavailable: false,
    databaseFails: false,
    reads: 0,
    writes: [] as string[],
  };
  const exports: Record<string, any> = {};
  vm.runInNewContext(
    ts.transpileModule(readFileSync("app/(chat)/actions.ts", "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      require: (name: string) => {
        if (name === "zod") return { z };
        if (name === "@/lib/errors") return { ChatSDKError };
        if (name === "./chat-route-session")
          return {
            getChatRequestSession: async () =>
              state.user ? { user: { id: state.user } } : null,
          };
        if (name === "@/lib/security/rate-limit")
          return {
            incrementRateLimit: async () => ({
              allowed: state.allowed,
              reason: state.unavailable ? "unavailable" : "limit",
            }),
          };
        if (name === "@/lib/db/queries")
          return {
            getMessageById: async () => {
              state.reads++;
              return state.messageExists
                ? [{ chatId: id, createdAt: new Date() }]
                : [];
            },
            getChatById: async () => {
              state.reads++;
              if (state.databaseFails)
                throw new Error("Disposable database outage.");
              return state.chatExists ? { id, userId: state.owner } : null;
            },
            deleteMessagesByChatIdAfterTimestamp: async () =>
              state.writes.push("delete"),
            updateChatVisiblityById: async () =>
              state.writes.push("visibility"),
            saveChat: async (chat: { userId: string }) =>
              state.writes.push(`create:${chat.userId}`),
          };
        if (
          ["next/cache", "next/headers", "@/lib/security/client-info"].includes(
            name,
          )
        )
          return {};
        throw new Error(`Unexpected import: ${name}`);
      },
    },
  );
  const mutate = () => [
    () => exports.deleteTrailingMessages({ id }),
    () => exports.updateChatVisibility({ chatId: id, visibility: "public" }),
    () =>
      exports.ensureChatExistsAction({
        chatId: id,
        visibility: "private",
        mode: "default",
        firstMessageText: "safe",
      }),
  ];
  return { state, exports, mutate };
}

test("anonymous chat actions perform no database reads or writes", async () => {
  const h = harness();
  h.state.user = null;
  for (const promise of h.mutate())
    await expect(promise()).rejects.toMatchObject({ type: "unauthorized" });
  expect(h.state.reads).toBe(0);
  expect(h.state.writes).toEqual([]);
});

test("another authenticated account cannot edit, publish or adopt someone else's chat", async () => {
  const h = harness();
  h.state.user = "intruder";
  for (const promise of h.mutate())
    await expect(promise()).rejects.toMatchObject({ type: "forbidden" });
  expect(h.state.writes).toEqual([]);
});

test("the owner can edit and share while invalid identifiers and missing rows fail safely", async () => {
  const h = harness();
  await Promise.all(h.mutate().map((call) => call()));
  expect(h.state.writes.sort()).toEqual(["delete", "visibility"]);
  h.state.chatExists = false;
  await expect(
    h.exports.ensureChatExistsAction({
      chatId: id,
      visibility: "private",
      mode: "default",
      firstMessageText: "safe",
    }),
  ).resolves.toMatchObject({ existed: false });
  expect(h.state.writes).toContain("create:owner");
  h.state.messageExists = false;
  await expect(h.exports.deleteTrailingMessages({ id })).rejects.toMatchObject({
    type: "not_found",
  });
  const reads = h.state.reads;
  await expect(
    h.exports.updateChatVisibility({ chatId: "invalid", visibility: "public" }),
  ).rejects.toMatchObject({ type: "bad_request" });
  await expect(
    h.exports.ensureChatExistsAction({
      chatId: id,
      visibility: "private",
      mode: "default",
      firstMessageText: "x".repeat(8001),
    }),
  ).rejects.toMatchObject({ type: "bad_request" });
  expect(h.state.reads).toBe(reads);
});

test("mutation quota, shared-counter outage and database outage all deny writes", async () => {
  for (const unavailable of [false, true]) {
    const h = harness();
    h.state.allowed = false;
    h.state.unavailable = unavailable;
    for (const promise of h.mutate())
      await expect(promise()).rejects.toMatchObject({
        type: unavailable ? "offline" : "rate_limit",
      });
    expect(h.state.reads).toBe(0);
    expect(h.state.writes).toEqual([]);
  }
  const h = harness();
  h.state.databaseFails = true;
  for (const promise of h.mutate())
    await expect(promise()).rejects.toThrow("outage");
  expect(h.state.writes).toEqual([]);
});
