import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { expect, test } from "../fixtures";

test.skip(process.env.ISOLATED_TEST_RUN !== "1", "Requires the disposable local environment.");

test("storage statistics and destructive cron reject unauthorized requests", async ({ request, adaContext }) => {
  expect((await request.get("/api/admin/storage")).status()).toBe(403);
  expect((await adaContext.request.get("/api/admin/storage")).status()).toBe(403);
  expect((await request.post("/api/admin/storage?dryRun=0")).status()).toBe(403);
  expect((await adaContext.request.post("/api/admin/storage?dryRun=0")).status()).toBe(403);
  for (const suffix of ["", "?dryRun=1"]) {
    const response = await request.get(`/api/cron/chat-storage-cleanup${suffix}`, { headers: { Authorization: "Bearer invalid-disposable-fixture" } });
    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
});

test("high storage is an admin alert and fresh demotion removes access", async ({ adaContext }) => {
  const url = new URL(process.env.POSTGRES_URL ?? "http://invalid");
  expect(["localhost", "127.0.0.1"]).toContain(url.hostname);
  expect(url.pathname.startsWith("/khasigpt_audit_")).toBe(true);
  const client = postgres(url.toString(), { max: 1, prepare: false });
  const session = await (await adaContext.request.get("/api/auth/session")).json();
  const adminId = session.user.id;
  const account = randomUUID();
  try {
    await client`UPDATE "User" SET role = 'admin' WHERE id = ${adminId}`;
    await client`INSERT INTO "ChatStorageAccount" ("userId",bytes,files) VALUES (${account},${1024 ** 3},200)`;
    const response = await adaContext.request.get("/api/admin/storage");
    expect(response.status()).toBe(200);
    expect((await response.json()).count).toBeGreaterThanOrEqual(1);
    expect((await adaContext.request.post("/api/admin/storage", { headers: { origin: "https://untrusted.example.test" } })).status()).toBe(403);
    await client`UPDATE "User" SET role = 'regular' WHERE id = ${adminId}`;
    expect((await adaContext.request.get("/api/admin/storage")).status()).toBe(403);
  } finally {
    await client`UPDATE "User" SET role = 'regular' WHERE id = ${adminId}`;
    await client`DELETE FROM "ChatStorageAccount" WHERE "userId" = ${account}`;
    await client.end();
  }
});
