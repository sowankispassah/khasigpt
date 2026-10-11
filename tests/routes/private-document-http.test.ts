import { createHmac } from "node:crypto";
import { expect, test } from "../fixtures";

test.skip(process.env.ISOLATED_TEST_RUN !== "1", "Requires the disposable local test environment.");

test("real download route rejects anonymous and invalid native-token requests", async ({ request }) => {
  const variants: Record<string, string>[] = [{}, { Authorization: "Bearer invalid-disposable-fixture" }];
  for (const headers of variants) {
    const response = await request.get("/api/files/download?token=invalid", { headers });
    expect(response.status()).toBe(401);
  }
});

test("real owner session passes auth while another user cannot read its document", async ({ adaContext, babbageContext }) => {
  const session = await (await adaContext.request.get("/api/auth/session")).json();
  const userId = session.user.id;
  const key = `uploads/${userId}/disposable-fixture.pdf`;
  const issuedAt = Date.now();
  const encoded = Buffer.from(JSON.stringify({ v: 2, url: `https://example.private.blob.vercel-storage.com/${key}`, key, userId, issuedAt, expiresAt: issuedAt + 3_600_000 })).toString("base64url");
  // This file only runs under the isolated harness's disposable database and
  // known fixture secret. No production credential or storage is used.
  expect(process.env.ISOLATED_TEST_RUN).toBe("1");
  const token = `${encoded}.${createHmac("sha256", "isolated-audit-test-secret").update(encoded).digest("base64url")}`;
  const url = `/api/files/download?token=${token}`;
  expect((await babbageContext.request.get(url)).status()).toBe(403);
  const response = await adaContext.request.get(url);
  expect(response.status()).toBe(503); // No private fixture store configured: fail closed.
  expect((await response.json()).code).toBe("offline:api");
});

test("native bearer image requests enforce ownership before private storage", async ({ adaContext, babbageContext, request }) => {
  expect(process.env.ISOLATED_TEST_RUN).toBe("1");
  const owner = (await (await adaContext.request.get("/api/auth/session")).json()).user.id;
  const other = (await (await babbageContext.request.get("/api/auth/session")).json()).user.id;
  const sign = (payload: unknown) => {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${encoded}.${createHmac("sha256", "isolated-audit-test-secret").update(encoded).digest("base64url")}`;
  };
  const key = `uploads/${owner}/native-fixture.png`;
  const issuedAt = Date.now();
  const token = sign({v:2,key,userId:owner,url:`https://example.private.blob.vercel-storage.com/${key}`,issuedAt,expiresAt:issuedAt+3_600_000});
  const url = `/api/files/download?token=${token}`;
  const nativeHeaders = (sub: string) => ({Authorization:`Bearer ${sign({sub,exp:Date.now()+120_000})}`});
  expect((await request.get(url,{headers:nativeHeaders(other)})).status()).toBe(403);
  expect((await request.get(url,{headers:nativeHeaders(owner)})).status()).toBe(503); // Auth passed; disposable environment has no private store.
});
