import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import ts from "typescript";
import { claimPaidGeneration, releasePaidGeneration } from "../lib/db/paid-generation-admission";

// Never load .env: this executable is restricted to a disposable LOCAL database.
const url = process.env.AUDIT_DATABASE_URL;
if (!url) throw new Error("AUDIT_DATABASE_URL must name an isolated local database");
const parsed = new URL(url);
if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) || !parsed.pathname.startsWith("/khasigpt_audit_")) {
  throw new Error("Refusing to mutate a non-local or non-audit database");
}
const client = postgres(url, { max: 12, connection: { statement_timeout: 10000 }, onnotice: () => {} });
const database = drizzle(client);
const queryRequire = createRequire(path.resolve("lib/db/queries.ts"));
const exports: Record<string, any> = {};
const mocks: Record<string, unknown> = {
  "server-only": {},
  "next/cache": { unstable_cache: (fn: unknown) => fn, revalidateTag: () => {} },
  "postgres": () => client,
  "@/lib/db/admin-database": { withAdminDatabase: (_label: string, operation: (db: typeof database) => unknown) => operation(database) },
  "../utils": { generateUUID: randomUUID },
  "../services/exchange-rate": { getUsdToInrRate: async () => ({ rate: 100 }), getFallbackUsdToInrRate: () => 100 },
};
const source = ts.transpileModule(readFileSync("lib/db/queries.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
vm.runInNewContext(source, {
  exports, require: (name: string) => name in mocks ? mocks[name] : queryRequire(name),
  process: { env: { POSTGRES_URL: url, SKIP_TRANSLATION_CACHE: "1" } },
  setTimeout, clearTimeout, console, Date, Error, URL, Buffer,
});

async function main() {
  const userId = randomUUID(), otherUserId = randomUUID(), chatId = randomUUID();
  const planId = randomUUID(), modelId = randomUUID(), imageModelId = randomUUID();
  await client`insert into "User" (id,email) values (${userId},${`${userId}@audit.invalid`}), (${otherUserId},${`${otherUserId}@audit.invalid`})`;
  await client`insert into "Chat" (id,"userId",title,"createdAt") values (${chatId},${userId},'isolated concurrency test',now())`;
  await client`insert into "PricingPlan" (id,name,"priceInPaise","tokenAllowance","billingCycleDays") values (${planId},'audit paid',10000,10000,30)`;
  await client`insert into "ModelConfig" (id,key,provider,"providerModelId","displayName","inputProviderCostPerMillion","outputProviderCostPerMillion","markupMultiplier") values (${modelId},${modelId},'openai','audit','audit',1,1,1)`;
  await client`insert into "ImageModelConfig" (id,key,provider,"providerModelId","displayName","providerCostPerOutputUsd","markupMultiplier") values (${imageModelId},${imageModelId},'openai','audit','audit',0.001,1)`;
  await exports.grantUserCredits({ userId, tokens: 10000 });
  const started = performance.now();
  await Promise.all(Array.from({ length: 20 }, (_, i) => [
    exports.grantUserCredits({ userId, tokens: 100 }),
    exports.deductImageCredits({ userId, chatId, imageModelConfigId: imageModelId, requestKey: `audit-image-${userId}-${i}` }),
    exports.recordTokenUsage({ userId, chatId, modelConfigId: modelId, inputTokens: 1000, outputTokens: 1000, requestKey: `audit-text-${userId}-${i}` }),
  ]).flat());
  const [wallet] = await client`select "tokenBalance","manualTokenBalance","paidTokenBalance" from "UserSubscription" where "userId"=${userId} and status='active'`;
  assert.equal(wallet.tokenBalance, 11400);
  assert.equal(wallet.tokenBalance, wallet.manualTokenBalance + wallet.paidTokenBalance);
  console.info("PASS: 60 concurrent real grants/text/image settlements; exact balance 11400; elapsed ms", Math.round(performance.now() - started));

  await Promise.all(Array.from({ length: 16 }, () => exports.recordTokenUsage({ userId, chatId, modelConfigId: modelId, inputTokens: 1000, outputTokens: 1000, requestKey: `audit-duplicate-${userId}` })));
  assert.equal(Number((await client`select count(*) as count from "CreditCharge" where "requestKey"=${`audit-duplicate-${userId}`}`)[0].count), 1);
  assert.equal((await client`select "tokenBalance" as balance from "UserSubscription" where "userId"=${userId} and status='active'`)[0].balance, 11380);
  console.info("PASS: 16 duplicate token settlements charged once");

  const orderId = `audit-${randomUUID()}`;
  await client`insert into "PaymentTransaction" ("orderId","userId","planId",status,amount,currency) values (${orderId},${userId},${planId},'processing',10000,'INR')`;
  const completed = await Promise.all(Array.from({ length: 12 }, () => exports.completePaymentTransactionWithSubscription({ userId, planId, orderId, paymentId: 'audit', signature: 'audit' })));
  assert.equal(completed.filter((entry) => !entry.alreadyProcessed).length, 1);
  assert.equal((await client`select "tokenBalance" as balance from "UserSubscription" where "userId"=${userId} and status='active'`)[0].balance, 21380);
  console.info("PASS: 12 payment finalizations credited once");

  await Promise.all(Array.from({ length: 16 }, () => exports.grantUserCredits({ userId: otherUserId, tokens: 100 })));
  const wallets = await client`select "tokenBalance" from "UserSubscription" where "userId"=${otherUserId} and status='active'`;
  assert.equal(wallets.length, 1); assert.equal(wallets[0].tokenBalance, 1600);
  console.info("PASS: 16 first-wallet grants created one wallet without lost credit");

  const admissions = await Promise.allSettled(Array.from({ length: 32 }, () => exports.acquirePaidGenerationForUser(userId)));
  const winners = admissions.filter((entry) => entry.status === 'fulfilled');
  assert.equal(winners.length, 1);
  const unrelated = await exports.acquirePaidGenerationForUser(otherUserId);
  await unrelated.release();
  if (winners[0].status === 'fulfilled') await winners[0].value.release();
  const oldClaim = await claimPaidGeneration(database, userId);
  await client`update "PaidGenerationLease" set "expiresAt"=now()-interval '1 second' where "userId"=${userId}`;
  const replacement = await claimPaidGeneration(database, userId);
  await releasePaidGeneration(database, userId, oldClaim.ownerId);
  assert.equal((await client`select "ownerId" from "PaidGenerationLease" where "userId"=${userId}`)[0].ownerId, replacement.ownerId);
  await releasePaidGeneration(database, userId, replacement.ownerId);
  console.info("PASS: 32 admissions produced one winner; unrelated user admitted; stale release cannot delete replacement");

  const balanceBeforeRollback = (await client`select "tokenBalance" as balance from "UserSubscription" where "userId"=${userId} and status='active'`)[0].balance;
  await assert.rejects(exports.recordTokenUsage({ userId, chatId: randomUUID(), modelConfigId: modelId, inputTokens: 1000, outputTokens: 1000, requestKey: `audit-rollback-${userId}` }));
  assert.equal((await client`select "tokenBalance" as balance from "UserSubscription" where "userId"=${userId} and status='active'`)[0].balance, balanceBeforeRollback);
  await Promise.all(Array.from({ length: 16 }, () => exports.deductImageCredits({ userId, chatId, imageModelConfigId: imageModelId, requestKey: `audit-image-duplicate-${userId}` })));
  assert.equal((await client`select "tokenBalance" as balance from "UserSubscription" where "userId"=${userId} and status='active'`)[0].balance, balanceBeforeRollback - 10);
  await assert.rejects(exports.acquirePaidGenerationForUser(userId, 100000000));
  console.info("PASS: failed usage insert rolled back deduction; duplicate images charged once; insufficient admission rejected");

  // Wallet timestamps are written as UTC by the application. Avoid casting the
  // database host's local time into a timestamp without time zone in fixtures.
  await client`update "UserSubscription" set "expiresAt"=${new Date(Date.now() - 1000).toISOString()} where "userId"=${otherUserId}`;
  await exports.grantUserCredits({ userId: otherUserId, tokens: 200 });
  const expirationRows = await client`select status,"tokenBalance" from "UserSubscription" where "userId"=${otherUserId}`;
  assert.equal(expirationRows.filter(row => row.status === 'active').length, 1);
  assert.equal(expirationRows.find(row => row.status === 'active')?.tokenBalance, 200);
  assert.equal(expirationRows.filter(row => row.status === 'expired').length, 1);
  console.info("PASS: expired wallet was not resurrected by a new grant");

  // Synthetic SQL load, not a claim about Vercel or provider throughput.
  await client`insert into "Chat" (id,"userId",title,"createdAt") select gen_random_uuid(),${userId},'audit history',now()-g*interval '1 minute' from generate_series(1,10000) g`;
  await client`analyze "Chat"`;
  const latencies: Record<string, number[]> = { identity: [], history: [], pricing: [] };
  const workloads = [
    { name: 'identity', run: () => exports.getUserById(userId) },
    { name: 'history', run: () => exports.getChatsByUserId({ id: userId, limit: 20, startingAfter: null, endingBefore: null }) },
    { name: 'pricing', run: () => exports.listAdminModelPricingSnapshot() },
  ];
  const loadStarted = performance.now();
  for (let batch = 0; batch < 20; batch += 1) {
    await Promise.all(Array.from({ length: 30 }, async (_, i) => {
      const workload = workloads[i % workloads.length];
      const start = performance.now();
      await workload.run();
      latencies[workload.name].push(performance.now() - start);
    }));
  }
  for (const [domain, values] of Object.entries(latencies)) {
    values.sort((a,b) => a-b);
    console.info('LOCAL LOAD', { domain, requests: values.length, p50Ms: Math.round(values[Math.floor(values.length * .5)]), p95Ms: Math.round(values[Math.floor(values.length * .95)]), maxMs: Math.round(values.at(-1) ?? 0) });
  }
  console.info('PASS: 600 mixed real read-model calls over 10000 additional history rows; elapsed ms', Math.round(performance.now() - loadStarted));
}
main().finally(() => client.end({ timeout: 2 })).catch((error) => { console.error(error); process.exitCode = 1; });
