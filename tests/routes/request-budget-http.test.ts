import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, request as requestFactory, test } from "@playwright/test";
import postgres from "postgres";
import sharp from "sharp";
import { docxFixture, pdfFixture } from "../support/attachment-fixtures";

test.skip(
  process.env.ISOLATED_TEST_RUN !== "1",
  "Requires disposable loopback schema and mocked generation.",
);
function database() {
  const url = new URL(process.env.POSTGRES_URL ?? "");
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);
  expect(url.pathname).toMatch(/^\/khasigpt_audit_/);
  return postgres(url.toString(), { max: 2 });
}
async function fixture(sql: ReturnType<typeof postgres>) {
  const id = randomUUID();
  await sql`insert into "User" (id,email,"firstName","dateOfBirth",role) values (${id},${`${id}@example.test`},'Budget','1990-01-01','admin')`;
  const body = Buffer.from(
    JSON.stringify({
      sub: id,
      type: "mobile-access",
      sessionVersion: 0,
      exp: Date.now() + 120000,
    }),
  ).toString("base64url");
  const token = `${body}.${createHmac("sha256", "isolated-audit-test-secret").update(body).digest("base64url")}`;
  return { id, headers: { Authorization: `Bearer ${token}` } };
}

test("oversized chat parts/body fail before persistence and a bounded native chat still streams", async ({
  request,
}) => {
  const sql = database();
  const user = await fixture(sql);
  const chatId = randomUUID();
  const body = (parts: object[]) => ({
    id: chatId,
    message: { id: randomUUID(), role: "user", parts },
    selectedVisibilityType: "private",
    selectedLanguage: "en",
  });
  try {
    const oversized = await request.post("/api/chat", {
      headers: user.headers,
      data: JSON.stringify({
        ...body([{ type: "text", text: "hello" }]),
        padding: "x".repeat(128 * 1024),
      }),
    });
    expect(oversized.status()).toBe(413);
    for (const parts of [
      Array.from({ length: 13 }, () => ({ type: "text", text: "x" })),
      Array(5).fill({ type: "text", text: "x".repeat(2000) }),
      Array(5).fill({
        type: "file",
        mediaType: "image/png",
        name: "image",
        url: "https://fixture.test/image",
      }),
    ]) {
      expect(
        (
          await request.post("/api/chat", {
            headers: user.headers,
            data: body(parts),
          })
        ).status(),
      ).toBe(400);
    }
    expect(await sql`select id from "Chat" where id=${chatId}`).toHaveLength(0);
    const valid = await request.post("/api/chat", {
      headers: user.headers,
      data: body([{ type: "text", text: "Why is grass green?" }]),
    });
    expect(valid.status()).toBe(200);
    expect(await valid.text()).toContain("text-delta");
  } finally {
    await sql.end();
  }
});

test("real web/native upload endpoint validates PDF/DOCX/image bytes and rejects bombs and extra fields", async ({
  request,
}) => {
  const sql = database();
  const user = await fixture(sql);
  await sql`insert into "AppSetting" (key,value,"updatedAt") values ('chat.documentUploads.enabled','"enabled"'::json,now()) on conflict(key) do update set value=excluded.value,"updatedAt"=excluded."updatedAt"`;
  try {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "green" },
    })
      .png()
      .toBuffer();
    for (const [buffer, type, name] of [
      [png, "image/png", "safe.png"],
      [pdfFixture(), "application/pdf", "safe.pdf"],
      [
        docxFixture(),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "safe.docx",
      ],
    ] as const) {
      const result = await request.post("/api/files/upload", {
        headers: user.headers,
        multipart: { file: { name, mimeType: type, buffer } },
      });
      expect(result.status()).toBe(200);
      expect((await result.json()).contentType).toBe(type);
    }
    for (const [buffer, type, name] of [
      [Buffer.from("fake"), "application/pdf", "fake.pdf"],
      [Buffer.from("fake"), "image/png", "fake.png"],
      [pdfFixture(101), "application/pdf", "long.pdf"],
      [
        docxFixture("x".repeat(500000)),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "bomb.docx",
      ],
    ] as const) {
      expect(
        (
          await request.post("/api/files/upload", {
            headers: user.headers,
            multipart: { file: { name, mimeType: type, buffer } },
          })
        ).status(),
      ).toBe(400);
    }
    expect(
      (
        await request.post("/api/files/upload", {
          headers: user.headers,
          multipart: {
            file: { name: "safe.png", mimeType: "image/png", buffer: png },
            padding: "extra",
          },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await request.post("/api/files/upload", {
          headers: user.headers,
          multipart: {
            file: {
              name: "huge.png",
              mimeType: "image/png",
              buffer: Buffer.alloc(5 * 1024 * 1024 + 20000),
            },
          },
        })
      ).status(),
    ).toBe(413);
  } finally {
    await sql.end();
  }
});

test("web and native avatars reject spoofed files and enforce one shared account upload quota", async ({
  request,
}) => {
  const sql = database();
  const user = await fixture(sql);
  try {
    const csrf = (await (await request.get("/api/auth/csrf")).json()).csrfToken;
    await request.post("/api/auth/callback/mobile-token", {
      form: { csrfToken: csrf, token: user.headers.Authorization.slice(7) },
      headers: { "X-Auth-Return-Redirect": "1" },
    });
    expect(
      (await (await request.get("/api/auth/session")).json()).user?.id,
    ).toBe(user.id);
    for (let i = 0; i < 10; i++) {
      const result =
        i % 2 === 0
          ? await request.post("/api/mobile/profile/avatar", {
              headers: user.headers,
              data: {
                fileName: "fake.png",
                mimeType: "image/png",
                base64: Buffer.from("fake").toString("base64"),
              },
            })
          : await request.post("/api/profile/avatar", {
              multipart: {
                image: {
                  name: "fake.png",
                  mimeType: "image/png",
                  buffer: Buffer.from("fake"),
                },
              },
            });
      expect(result.status()).toBe(400);
    }
    expect(
      (
        await request.post("/api/mobile/profile/avatar", {
          headers: user.headers,
          data: {
            fileName: "fake.png",
            mimeType: "image/png",
            base64: "ZmFrZQ==",
          },
        })
      ).status(),
    ).toBe(429);
  } finally {
    await sql.end();
  }
});

test("real Server Action POSTs deny another account's edits and sharing while allowing the owner", async ({
  request,
  baseURL,
}) => {
  const sql = database();
  const owner = await fixture(sql);
  const intruder = await fixture(sql);
  const chatId = randomUUID();
  const messageId = randomUUID();
  const contexts: import("@playwright/test").APIRequestContext[] = [];
  const manifest = JSON.parse(
    readFileSync(
      ".next-isolated-tests/server/server-reference-manifest.json",
      "utf8",
    ),
  );
  const actionId = (name: string) => {
    const entry = Object.entries(manifest.node).find(
      ([, value]) => (value as { exportedName?: string }).exportedName === name,
    );
    if (!entry) throw new Error(`Missing compiled action: ${name}`);
    return entry[0];
  };
  const post = (api: typeof request, name: string, args: object) =>
    api.post("/chat", {
      headers: {
        "Next-Action": actionId(name),
        "Content-Type": "text/plain;charset=UTF-8",
        Origin: baseURL ?? "http://localhost:3100",
      },
      data: JSON.stringify([args]),
    });
  try {
    await sql`insert into "Chat" (id,"createdAt","userId",title,visibility) values (${chatId},now(),${owner.id},'Disposable ownership fixture','private')`;
    await sql`insert into "Message_v2" (id,"chatId",role,parts,attachments,"createdAt") values (${messageId},${chatId},'user',${sql.json([{ type: "text", text: "Disposable ownership fixture" }])},${sql.json([])},now())`;
    for (const user of [owner, intruder]) {
      const api = await requestFactory.newContext({ baseURL });
      contexts.push(api);
      const csrf = (await (await api.get("/api/auth/csrf")).json()).csrfToken;
      await api.post("/api/auth/callback/mobile-token", {
        form: { csrfToken: csrf, token: user.headers.Authorization.slice(7) },
        headers: { "X-Auth-Return-Redirect": "1" },
      });
      expect((await (await api.get("/api/auth/session")).json()).user?.id).toBe(
        user.id,
      );
    }
    for (const api of [request, contexts[1]]) {
      await post(api, "updateChatVisibility", { chatId, visibility: "public" });
      await post(api, "deleteTrailingMessages", { id: messageId });
      expect(
        (await sql`select visibility from "Chat" where id=${chatId}`)[0]
          .visibility,
      ).toBe("private");
      expect(
        await sql`select id from "Message_v2" where id=${messageId}`,
      ).toHaveLength(1);
    }
    expect(
      (
        await post(contexts[0], "updateChatVisibility", {
          chatId,
          visibility: "public",
        })
      ).status(),
    ).toBe(200);
    expect(
      (await sql`select visibility from "Chat" where id=${chatId}`)[0]
        .visibility,
    ).toBe("public");
    expect(
      (
        await post(contexts[0], "deleteTrailingMessages", { id: messageId })
      ).status(),
    ).toBe(200);
    expect(
      await sql`select id from "Message_v2" where id=${messageId}`,
    ).toHaveLength(0);
  } finally {
    for (const api of contexts) await api.dispose();
    await sql.end();
  }
});
