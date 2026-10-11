import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import ts from "typescript";

const url = process.env.AUDIT_DATABASE_URL;
if (!url) throw new Error("AUDIT_DATABASE_URL is required");
const parsed = new URL(url);
if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) || !parsed.pathname.startsWith("/khasigpt_audit_")) throw new Error("A disposable local audit database is required");
const client = postgres(url, { max: 12, connection: { statement_timeout: 10_000, TimeZone: "UTC" }, onnotice: () => {} });
const database = drizzle(client);
type Exports = Record<string, any>;
function load(file: string, mocks: Record<string, unknown>, environment: Record<string, string> = {}): Exports {
  const exports: Exports = {};
  const require = createRequire(path.resolve(file));
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(source, { exports, require: (name: string) => name in mocks ? mocks[name] : require(name), process: { env: { POSTGRES_URL: url, SKIP_TRANSLATION_CACHE: "1", ...environment } }, setTimeout, clearTimeout, console, Date, Error, URL, Buffer, Response, Request, Uint8Array, AbortSignal });
  return exports;
}
const queries = load("lib/db/queries.ts", {
  "server-only": {}, "next/cache": { unstable_cache: (fn: unknown) => fn, revalidateTag: () => {} }, "postgres": () => client,
  "@/lib/db/admin-database": { withAdminDatabase: (_label: string, operation: (db: typeof database) => unknown) => operation(database) },
  "../utils": { generateUUID: randomUUID },
  "../services/exchange-rate": { getUsdToInrRate: async () => ({ rate: 100 }), getFallbackUsdToInrRate: () => 100 },
});
let failEmail = true;
let emails = 0;
let googleLookups = 0;
const receipts = load("lib/payments/receipts.ts", { "server-only": {}, "@/lib/db/queries": { db: database }, "@/lib/email/brevo": { sendPaymentReceiptEmail: async () => { emails++; if (failEmail) throw new Error("Fixture email outage"); } }, "./google-play": { getGooglePlayOrderTotal: async () => { googleLookups++; return { amount: 12345, currency: "INR" }; } } });
const response = load("lib/payments/receipt-response.ts", { "./receipts": receipts, "@/lib/security/rate-limit": { incrementRateLimit: async () => ({ allowed: true }) } });
let session: { user: { id: string } } | null = null;
let admin: { id: string } | null = null;
const userRoute = load("app/api/billing/receipts/[orderId]/route.ts", { "@/app/(auth)/auth": { auth: async () => session }, "@/lib/payments/receipt-response": response });
const mobileRoute = load("app/api/mobile/billing/receipts/[orderId]/route.ts", { "@/lib/mobile-auth-session": { getMobileSession: async () => session }, "@/lib/payments/receipt-response": response });
const adminRoute = load("app/api/admin/account/receipts/[orderId]/route.ts", { "@/lib/db/queries": { db: database }, "@/lib/security/admin-api-auth": { requireAdminApiUser: async () => admin }, "@/lib/payments/receipt-response": response });

const userId = randomUUID(), otherUserId = randomUUID(), planId = randomUUID();
const orderId = `receipt_${randomUUID()}`, pendingId = `pending_${randomUUID()}`, legacyId = `legacy_${randomUUID()}`, googleId = `google_${randomUUID()}`;
async function main() {
  // Match Supabase's client roles on the disposable local PostgreSQL instance.
  await client.unsafe(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$;`);
  await client.unsafe(readFileSync("lib/db/migrations/0121_payment_receipts.sql", "utf8"));
  await client`insert into "User" (id,email) values (${userId},${`receipt-${userId}@example.test`}),(${otherUserId},${`receipt-${otherUserId}@example.test`})`;
  await client`insert into "PricingPlan" (id,name,"priceInPaise","tokenAllowance","billingCycleDays") values (${planId},'Receipt original plan',49900,1000,30)`;
  await client`insert into "PaymentTransaction" ("orderId","userId","planId",status,amount,currency) values (${orderId},${userId},${planId},'processing',39900,'INR'),(${pendingId},${userId},${planId},'pending',49900,'INR'),(${legacyId},${userId},${planId},'paid',49900,'INR')`;
  const completed = await Promise.all(Array.from({ length: 12 }, () => queries.completePaymentTransactionWithSubscription({ orderId, userId, planId, paymentId: 'pay_receipt', signature: 'fixture' })));
  assert.equal(completed.filter((item) => !item.alreadyProcessed).length, 1);
  assert.equal(Number((await client`select count(*) as count from "PaymentReceipt" where "orderId"=${orderId}`)[0].count), 1);
  const original = await receipts.getOwnedReceipt(orderId, userId);
  assert.equal(original.amount, 39900);
  await client`update "PricingPlan" set name='Renamed plan',"priceInPaise"=99900 where id=${planId}`;
  await client`update "User" set email=${`new-${userId}@example.test`} where id=${userId}`;
  assert.equal((await receipts.getOwnedReceipt(orderId, userId)).planName, 'Receipt original plan');
  assert.equal((await receipts.getOwnedReceipt(orderId, userId)).email, original.email);
  assert.equal(await receipts.getOwnedReceipt(orderId, otherUserId), null);
  assert.equal(await receipts.getOwnedReceipt(pendingId, userId), null);
  console.info("PASS: concurrent payment completion creates one immutable receipt; pending and foreign purchases are excluded");

  await receipts.deliverReceiptEmail(orderId);
  assert.equal((await client`select status from "PaymentTransaction" where "orderId"=${orderId}`)[0].status, 'paid');
  assert.equal((await client`select "emailSentAt" from "PaymentReceipt" where "orderId"=${orderId}`)[0].emailSentAt, null);
  failEmail = false;
  await client`update "PaymentReceipt" set "nextAttemptAt"=now() where "orderId"=${orderId}`;
  await Promise.all(Array.from({ length: 12 }, () => receipts.deliverReceiptEmail(orderId)));
  assert.equal(emails, 2);
  assert.ok((await client`select "emailSentAt" from "PaymentReceipt" where "orderId"=${orderId}`)[0].emailSentAt);
  await receipts.getOwnedReceipt(legacyId, userId);
  await receipts.deliverReceiptEmail(legacyId);
  assert.equal(emails, 2);
  console.info("PASS: email failure preserves paid status; concurrent retries send once; historical downloads do not send old emails");

  const context = { params: Promise.resolve({ orderId }) };
  assert.equal((await userRoute.GET(new Request('https://example.test'), context)).status, 401);
  session = { user: { id: otherUserId } };
  assert.equal((await userRoute.GET(new Request('https://example.test'), context)).status, 404);
  assert.equal((await mobileRoute.GET(new Request('https://example.test'), context)).status, 404);
  session = { user: { id: userId } };
  const owned = await userRoute.GET(new Request('https://example.test'), context);
  assert.equal(owned.status, 200);
  assert.equal(owned.headers.get('cache-control'), 'private, no-store');
  assert.equal(owned.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await owned.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  assert.equal((await adminRoute.GET(new Request('https://example.test'), context)).status, 403);
  admin = { id: otherUserId };
  assert.equal((await adminRoute.GET(new Request('https://example.test'), context)).status, 200);
  assert.equal((await response.receiptResponse('../secret', userId, userId)).status, 400);
  console.info("PASS: web/mobile ownership, admin access, private PDF headers and invalid input behavior");

  await client`insert into "PaymentTransaction" ("orderId","userId","planId",status,amount,currency,provider,"paymentId") values (${googleId},${userId},${planId},'paid',99900,'INR','google_play','GPA.fixture')`;
  const historical = await receipts.getOwnedReceipt(googleId, userId);
  assert.equal(historical.amount, 99900);
  assert.equal(historical.amountSource, "recorded");
  assert.equal(googleLookups, 0);
  console.info("PASS: historical receipt preserves the recorded amount without checkout credentials");
  const newGoogleId = `new_google_${randomUUID()}`;
  await client`insert into "PaymentTransaction" ("orderId","userId","planId",status,amount,currency,provider) values (${newGoogleId},${userId},${planId},'processing',99900,'INR','google_play')`;
  await queries.completePaymentTransactionWithSubscription({ orderId: newGoogleId, userId, planId, paymentId: 'GPA.new-fixture', signature: 'fixture' });
  assert.equal((await receipts.getOwnedReceipt(newGoogleId, userId)).amount, 12345);
  assert.equal(googleLookups, 1);
  console.info("PASS: new Google Play receipts resolve the confirmed total before email or download");
  assert.equal((await client`select has_table_privilege('anon','"PaymentReceipt"','SELECT') as allowed`)[0].allowed, false);
  assert.equal((await client`select has_table_privilege('authenticated','"PaymentReceipt"','INSERT') as allowed`)[0].allowed, false);
  console.info("PASS: receipt table denies Supabase client access");
  const callbacks: Array<() => Promise<void>> = [];
  let retryRuns = 0;
  const next = createRequire(path.resolve("package.json"))("next/server");
  const cron = load("app/api/cron/chat-storage-cleanup/route.ts", {
    "next/server": { ...next, after: (callback: () => Promise<void>) => callbacks.push(callback) },
    "@/lib/payments/receipts": { deliverPendingReceiptEmails: async () => { retryRuns++; } },
    "@/lib/uploads/storage-maintenance": { runChatStorageMaintenance: async ({ dryRun }: { dryRun: boolean }) => { if (!dryRun) throw new Error("Fixture storage outage"); return { ok: true }; } },
  }, { CRON_SECRET: "fixture-cron" });
  assert.equal((await cron.GET(new Request("https://example.test/api/cron/chat-storage-cleanup"))).status, 401);
  assert.equal(callbacks.length, 0);
  const cronHeaders = { Authorization: "Bearer fixture-cron" };
  assert.equal((await cron.GET(new Request("https://example.test/api/cron/chat-storage-cleanup?dryRun=1", { headers: cronHeaders }))).status, 200);
  assert.equal(callbacks.length, 0);
  assert.equal((await cron.GET(new Request("https://example.test/api/cron/chat-storage-cleanup", { headers: cronHeaders }))).status, 503);
  await callbacks[0]();
  assert.equal(retryRuns, 1);
  console.info("PASS: daily receipt retries survive storage failures; unauthorized and dry-run maintenance sends no email");
}
main().finally(async () => {
  await client`delete from "User" where id in (${userId},${otherUserId})`;
  await client`delete from "PricingPlan" where id=${planId}`;
  await client.end();
}).catch((error) => { console.error(error); process.exitCode = 1; });
