import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

const requireModule = createRequire(path.join(process.cwd(), "package.json"));
const owner = "11111111-1111-4111-8111-111111111111";
const stranger = "22222222-2222-4222-8222-222222222222";
const key = `uploads/${owner}/document-example.pdf`;
const blobUrl = `https://example.private.blob.vercel-storage.com/${key}`;
const secret = "disposable-document-test-secret";
const pngFixture = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAD0lEQVQImWNgaGAAIQgFAA4OAgHj5clFAAAAAElFTkSuQmCC", "base64");

function harness() {
  const env: Record<string, string> = { AUTH_SECRET: secret, CHAT_DOCUMENT_BLOB_STORE_ID: "store_example" };
  const getCalls: Array<{ key: string; options: any }> = [];
  const putCalls: Array<{ key: string; options: any }> = [];
  let session: any = { user: { id: owner, role: "regular" } };
  let user: any = { id: owner, isActive: true, role: "regular" };
  let allowed = true;
  let storageFailure = false;
  let missing = false;
  let data = Buffer.from("private PDF fixture");
  function load(file: string, mocks: Record<string, any> = {}) {
    const exports: Record<string, any> = {};
    vm.runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, {
      exports, process: { env }, Buffer, URL, Request, Response, Headers, AbortSignal,
      console, Date, ReadableStream, Blob, File, setTimeout, clearTimeout, crypto: requireModule("node:crypto"),
      require: (name: string) => name === "server-only" ? {} : name in mocks ? mocks[name] : requireModule(name),
    });
    return exports;
  }
  const token = load("lib/security/blob-token.ts");
  const documents = load("lib/uploads/document-uploads.ts", { "@/lib/feature-access": { parseFeatureAccessMode: (value: string) => value } });
  const storage = load("lib/uploads/private-documents.ts", {
    "@/lib/uploads/document-uploads": documents,
    "@vercel/blob": {
      get: async (k: string, options: any) => {
        getCalls.push({ key: k, options });
        if (storageFailure) throw new Error("Storage unavailable");
        if (missing) return null;
        return { statusCode: 200, stream: new ReadableStream({ start(c) { c.enqueue(data); c.close(); } }), blob: { contentType: k.endsWith(".png") ? "image/png" : "application/pdf", size: data.length, contentDisposition: "attachment; filename=fixture.pdf" } };
      },
      put: async (k: string, _buffer: Buffer, options: any) => { putCalls.push({ key: k, options }); return { url: `https://example.private.blob.vercel-storage.com/${k}`, pathname: k, contentType: options.contentType }; },
    },
  });
  const access = load("lib/uploads/document-access.ts", {
    "@/lib/security/blob-token": token,
    "@/lib/uploads/private-documents": storage,
    "@/lib/uploads/document-uploads": documents,
  });
  const errors = load("lib/errors.ts");
  const images = load("lib/uploads/private-images.ts", {
    "@/lib/uploads/image-validation": load("lib/uploads/image-validation.ts"),
    "@/lib/uploads/document-access": access,
    "@/lib/uploads/private-documents": storage,
  });
  const route = load("app/api/files/download/route.ts", {
    "@/lib/errors": errors,
    "@/lib/mobile-auth-session": { getAuthenticatedSession: async () => session },
    "@/lib/security/blob-token": token,
    "@/lib/uploads/document-access": access,
    "@/lib/uploads/private-documents": storage,
    "@/lib/security/rate-limit": { incrementRateLimit: async () => ({ allowed }) },
    "@/lib/security/request-helpers": { getClientKeyFromHeaders: () => "fixture-ip" },
    "@/lib/db/auth-queries": { getAuthUserById: async () => user },
    "@/lib/utils/async": { withTimeout: (promise: Promise<unknown>) => promise },
  });
  const downloadUrl = access.buildDocumentDownloadUrl({ blobUrl, userId: owner, baseUrl: "https://app.example.test" });
  const upload = load("app/(chat)/api/files/upload/route.ts", {
    "@/lib/security/request-body": load("lib/security/request-body.ts"),
    "@/lib/uploads/image-validation": load("lib/uploads/image-validation.ts"),
    // Storage ownership tests isolate parsing; real parser/file fixtures are
    // exercised separately by request-budget-security/http tests.
    "@/lib/uploads/chat-document-parser": { extractChatDocument: async () => ({ text: "fixture", truncated: false }) },
    "@vercel/blob": { put: () => { throw new Error("Documents must not use public uploads"); } },
    "next/server": { NextResponse: { json: Response.json } },
    "@/lib/constants": { DOCUMENT_UPLOADS_FEATURE_FLAG_KEY: "documents" },
    "@/lib/mobile-auth-session": { getMobileSession: async () => session },
    "@/lib/security/rate-limit": { incrementRateLimit: async () => ({ allowed, resetAt: Date.now() + 60_000 }) },
    "@/lib/security/request-helpers": { getClientKeyFromHeaders: () => "fixture-ip" },
    "@/lib/settings/feature-access-settings": { loadFeatureAccessSettingsByKeys: async () => ({}), getFeatureAccessModeSettingValue: () => "enabled" },
    "@/lib/settings/user-feature-access": { isFeatureEnabledForUser: async () => true },
    "@/lib/uploads/document-access": access,
    "@/lib/uploads/private-documents": storage,
    "@/lib/uploads/document-uploads": documents,
  });
  const request = () => new Request(downloadUrl);
  return { token, storage, access, images, route, upload, downloadUrl, request, env, getCalls, putCalls,
    image: () => { data = pngFixture; },
    largeGeneratedImage: () => { data = Buffer.alloc(9 * 1024 * 1024); },
    anonymous: () => { session = null; },
    stranger: () => { session.user.id = stranger; user.id = stranger; },
    deactivate: () => { user.isActive = false; },
    staleAdmin: () => { session.user = { id: stranger, role: "admin" }; user = { id: stranger, role: "regular", isActive: true }; },
    deny: () => { allowed = false; },
    fail: () => { storageFailure = true; },
    remove: () => { missing = true; },
    oversize: () => { data = Buffer.alloc(5 * 1024 * 1024 + 1); },
  };
}

test("actual PDF and DOCX upload handlers return authenticated links and use only private storage", async () => {
  for (const type of ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]) {
    const h = harness();
    const form = new FormData(); form.set("file", new File(["disposable fixture"], "fixture", { type }));
    const response = await h.upload.POST(new Request("https://app.example.test/api/files/upload", { method: "POST", body: form }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(new URL(body.url).pathname).toBe("/api/files/download");
    expect(body.contentType).toBe(type);
    expect(h.putCalls).toHaveLength(1);
    expect(h.putCalls[0].options.access).toBe("private");
    expect((await h.route.GET(new Request(body.url))).status).toBe(200);
  }
});

test("an owner downloads private bytes with no public fetch or shared cache", async () => {
  const h = harness();
  const response = await h.route.GET(h.request());
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("private PDF fixture");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(h.getCalls[0]).toMatchObject({ key, options: { access: "private", storeId: "store_example", useCache: false } });
});

test("anonymous, other-user, deactivated, revoked-admin, and rate-limited requests never read storage", async () => {
  for (const [change, status] of [["anonymous", 401], ["stranger", 403], ["deactivate", 401], ["staleAdmin", 403], ["deny", 429]] as const) {
    const h = harness(); h[change]();
    expect((await h.route.GET(h.request())).status).toBe(status);
    expect(h.getCalls).toHaveLength(0);
  }
});

test("tokens expire and malformed, modified, unicode, and appended tokens are rejected safely", () => {
  const h = harness();
  const fresh = new URL(h.downloadUrl).searchParams.get("token") ?? "";
  expect(h.token.verifyBlobToken(fresh)?.v).toBe(2);
  const expired = h.token.createBlobToken({ url: blobUrl, key, userId: owner, issuedAt: Date.now() - h.token.BLOB_TOKEN_MAX_AGE_MS - 1 });
  expect(h.token.verifyBlobToken(expired)).toBeNull();
  for (const invalid of [`${fresh}.extra`, `x.${"é".repeat(43)}`, fresh.replace(/.$/, "!"), "x".repeat(4097)]) expect(h.token.verifyBlobToken(invalid)).toBeNull();
});

test("only trusted history renews legacy links, and unauthorized viewers receive no link", async () => {
  const h = harness();
  const oldUrl = blobUrl.replace(".private.", ".public.");
  const payload = Buffer.from(JSON.stringify({ v: 1, url: oldUrl, key, userId: owner, issuedAt: Date.now() - 10_000_000 })).toString("base64url");
  const legacy = `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
  const source = `https://app.example.test/api/files/download?token=${legacy}`;
  expect(h.token.verifyBlobToken(legacy)).toBeNull();
  expect((await h.route.GET(new Request(source))).status).toBe(400);
  const messages = [{ parts: [{ type: "file", mediaType: "application/pdf", url: source }] }];
  const rewritten = h.access.rewriteDocumentUrlsForViewer({ messages, viewerUserId: owner, isAdmin: false, baseUrl: "https://app.example.test" });
  const aliasMessages = [{ parts: [{ type: "file", mediaType: "application/pdf", url: source.replace("app.example.test", "www.app.example.test") }] }];
  expect(h.access.rewriteDocumentUrlsForViewer({ messages: aliasMessages, viewerUserId: owner, isAdmin: false, baseUrl: "https://app.example.test" })[0].parts[0].url).not.toBe("");
  expect((await h.route.GET(new Request(rewritten[0].parts[0].url))).status).toBe(200);
  expect(h.getCalls[0].key).toBe(key);
  for (const viewerUserId of [null, stranger]) expect(h.access.rewriteDocumentUrlsForViewer({ messages, viewerUserId, isAdmin: false, baseUrl: "https://app.example.test" })[0].parts[0].url).toBe("");
});

test("cross-origin token links, traversal, and untrusted remote URLs cannot resolve", () => {
  const h = harness();
  for (const sourceUrl of [h.downloadUrl.replace("app.example.test", "attacker.example.test"), "https://attacker.example.test/secret.pdf", blobUrl.replace("document-example.pdf", "%2e%2e%2fsecret.pdf")]) {
    expect(h.access.resolveDocumentBlobUrl({ sourceUrl, userId: owner, isAdmin: false, baseUrl: "https://app.example.test" })).toBeNull();
  }
});

test("image uploads and owner previews stay private while anonymous and other-user reads are denied", async () => {
  const h = harness(); h.image();
  const form = new FormData(); form.set("file", new File([pngFixture], "test.png", {type:"image/png"}));
  const uploaded = await h.upload.POST(new Request("https://app.example.test/api/files/upload", {method:"POST",body:form}));
  expect(uploaded.status).toBe(200);
  const data = await uploaded.json();
  expect(h.putCalls[0].options.access).toBe("private");
  const imageResponse = await h.route.GET(new Request(data.url));
  expect(imageResponse.status).toBe(200);
  expect(imageResponse.headers.get("Content-Disposition")).toMatch(/^inline;/);
  expect(imageResponse.headers.get("Cache-Control")).toBe("private, no-store");
  h.stranger(); expect((await h.route.GET(new Request(data.url))).status).toBe(403);
  h.anonymous(); expect((await h.route.GET(new Request(data.url))).status).toBe(401);
});

test("model input uses owned bounded image bytes and rejects foreign images without storage reads", async () => {
  const h = harness(); h.image();
  const imageUrl = blobUrl.replace(".pdf", ".png");
  const current = {id:"current",role:"user",parts:[{type:"file",mediaType:"image/png",url:imageUrl}]};
  const hydrated = await h.images.hydratePrivateImageMessages([current], owner, "https://app.example.test");
  expect(hydrated[0].parts[0].url).toMatch(/^data:image\/png;base64,/);
  expect(current.parts[0].url).toBe(imageUrl); // Persist the reference, never the in-memory model bytes.
  const before = h.getCalls.length;
  for(const url of [imageUrl.replace(owner,stranger),"https://external.example/image.png","https://attacker.example.test/api/files/download?token=invalid"]) {
    await expect(h.images.readOwnedImage(url,owner,"https://app.example.test")).rejects.toThrow();
  }
  expect(h.getCalls.length).toBe(before);
  await expect(h.images.hydratePrivateImageMessages([{...current,parts:Array(5).fill(current.parts[0])}],owner,"https://app.example.test")).rejects.toThrow("Too many");
  const legacy = `https://example.public.blob.vercel-storage.com/generated-images/${owner}/33333333-3333-4333-8333-333333333333/test.png`;
  expect((await h.images.readOwnedImage(legacy,owner,"https://app.example.test")).mediaType).toBe("image/png");
});

test("image history renews private links and shared-chat anonymous viewers receive no private image URL", () => {
  const h = harness();
  const messages=[{id:"image",role:"assistant",parts:[{type:"file",mediaType:"image/png",url:`https://example.public.blob.vercel-storage.com/generated-images/${owner}/33333333-3333-4333-8333-333333333333/test.png`}]}];
  const rewritten=h.access.rewriteDocumentUrlsForViewer({messages,viewerUserId:owner,isAdmin:false,baseUrl:"https://app.example.test"});
  expect(rewritten[0].parts[0].url).toContain("/api/files/download?token=");
  for(const viewerUserId of [null,stranger]) expect(h.access.rewriteDocumentUrlsForViewer({messages,viewerUserId,isAdmin:false,baseUrl:"https://app.example.test"})[0].parts[0].url).toBe("");
});

test("generated image byte bounds preserve larger outputs without expanding upload limits", async () => {
  const h = harness(); h.largeGeneratedImage();
  const generatedKey = `generated-images/${owner}/33333333-3333-4333-8333-333333333333/test.png`;
  expect((await h.storage.readPrivateFile(generatedKey)).length).toBe(9 * 1024 * 1024);
  await expect(h.storage.readPrivateFile(`uploads/${owner}/test.png`)).rejects.toThrow("too large");
  await expect(h.storage.putPrivateFile(generatedKey, Buffer.alloc(10 * 1024 * 1024 + 1), "image/png")).rejects.toThrow("too large");
});

test("private upload errors fail closed, and private reads are bounded and never fall back to public storage", async () => {
  const h = harness();
  await h.storage.putPrivateDocument(key, Buffer.from("fixture"), "application/pdf");
  expect(h.putCalls[0].options).toMatchObject({ access: "private", storeId: "store_example" });
  await expect(h.storage.putPrivateDocument("../file.pdf", Buffer.from("fixture"), "application/pdf")).rejects.toThrow();
  h.oversize(); await expect(h.storage.readPrivateDocument(key)).rejects.toThrow("too large");
  h.fail(); expect((await h.route.GET(h.request())).status).toBe(503);
  expect(h.getCalls.every(call => call.options.access === "private")).toBe(true);
  const missing = harness(); missing.remove(); expect((await missing.route.GET(missing.request())).status).toBe(404);
});
