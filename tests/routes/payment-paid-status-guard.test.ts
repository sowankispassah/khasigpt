import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import { ChatSDKError } from "@/lib/errors";

// Crediting commits before receipts, coupon records and balance reads run. A
// paid order demoted to "failed" can be locked and credited again, so these
// tests drive the real routes and the real status guard over an in-memory row.

type Row = Record<string, unknown> & { orderId: string; status: string };

const USER_ID = "00000000-0000-4000-8000-000000000001";
const PLAN_ID = "00000000-0000-4000-8000-000000000002";
const BALANCE = { creditsRemaining: 99, plan: { id: PLAN_ID }, tokensRemaining: 99_000 };
const SECRETS = ["pay_secret_fixture", "sig_secret_fixture", "purchase-token-secret"];
const compileOptions = { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } };

function compileFunction(file: string, name: string) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!declaration) throw new Error(`${name} was not found.`);
  return ts.transpileModule(`${declaration.getText(source)}\nexports.run = ${name};`, compileOptions).outputText;
}

const markFailedCode = compileFunction("lib/db/queries.ts", "markPaymentTransactionFailed");

// Evaluates drizzle conditions against plain rows so the real WHERE clause decides.
function loadMarkFailed(rows: Row[]) {
  const context = vm.createContext({
    exports: {} as Record<string, any>,
    PAYMENT_STATUS_PENDING: "pending",
    PAYMENT_STATUS_PROCESSING: "processing",
    PAYMENT_STATUS_PAID: "paid",
    PAYMENT_STATUS_FAILED: "failed",
    paymentTransaction: { orderId: "orderId", status: "status", updatedAt: "updatedAt", userId: "userId" },
    eq: (column: string, value: unknown) => (row: Row) => row[column] === value,
    ne: (column: string, value: unknown) => (row: Row) => row[column] !== value,
    inArray: (column: string, values: unknown[]) => (row: Row) => values.includes(row[column]),
    notInArray: (column: string, values: unknown[]) => (row: Row) => !values.includes(row[column]),
    and: (...conditions: ((row: Row) => boolean)[]) => (row: Row) => conditions.filter(Boolean).every((condition) => condition(row)),
    or: (...conditions: ((row: Row) => boolean)[]) => (row: Row) => conditions.filter(Boolean).some((condition) => condition(row)),
    db: {
      update: () => ({
        set: (values: Record<string, unknown>) => ({
          where: async (condition: unknown) => {
            if (typeof condition !== "function") throw new Error("Unscoped payment update.");
            for (const row of rows) if (condition(row)) Object.assign(row, values);
          },
        }),
      }),
    },
    isTableMissingError: () => false,
    ChatSDKError,
  });
  vm.runInContext(markFailedCode, context);
  return context.exports.run as (input: { orderId: string }) => Promise<void>;
}

function loadModule(file: string, mocks: Record<string, unknown>, globals: Record<string, unknown>) {
  const exports: Record<string, any> = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), compileOptions).outputText, {
    exports, Response, ...globals,
    require: (name: string) => {
      if (name in mocks) return mocks[name];
      throw new Error(`Unexpected import ${name}`);
    },
  });
  return exports;
}

// Shared payment store, ledger and failure switches for one route.
function paymentHarness(initialRows: Row[] = []) {
  const rows = initialRows.map((row) => ({ ...row }));
  const realMarkFailed = loadMarkFailed(rows);
  const state = { credits: 0, failures: new Set<string>(), logs: [] as unknown[][], steps: [] as string[] };
  const find = (orderId: string) => rows.find((row) => row.orderId === orderId);
  const logger = { error: (...args: unknown[]) => state.logs.push(args), warn() {}, info() {}, log() {} };
  const queries = {
    getPaymentTransactionByOrderId: async ({ orderId }: { orderId: string }) => {
      const row = find(orderId);
      if (state.failures.has("read") && row?.status === "paid") throw new ChatSDKError("bad_request:database", "Failed to load payment transaction");
      return row ? { ...row } : null;
    },
    markPaymentTransactionProcessing: async ({ orderId, retryFailed = false }: { orderId: string; retryFailed?: boolean }) => {
      const row = find(orderId);
      if (!row || !(row.status === "pending" || (retryFailed && row.status === "failed"))) return false;
      row.status = "processing";
      return true;
    },
    completePaymentTransactionWithSubscription: async ({ orderId }: { orderId: string }) => {
      if (state.failures.has("credit")) throw new Error("Connection reset before commit");
      const row = find(orderId);
      if (row?.status === "paid") return { alreadyProcessed: true, subscription: null };
      if (row?.status !== "processing") throw new ChatSDKError("bad_request:database", "Payment transaction is not ready to complete");
      row.status = "paid";
      state.credits += 1;
      if (state.failures.has("lost-ack")) throw new Error("Commit acknowledgement lost");
      return { alreadyProcessed: false, subscription: null };
    },
    markPaymentTransactionFailed: async (input: { orderId: string }) => {
      state.steps.push("mark-failed");
      await realMarkFailed(input);
    },
    recordCouponRedemptionFromTransaction: async () => {
      state.steps.push("coupon");
      if (state.failures.has("coupon")) throw new Error("Coupon store unavailable");
    },
    getUserBalanceSummary: async () => {
      if (state.failures.has("balance")) throw new ChatSDKError("bad_request:database", "Failed to load user balance summary");
      return BALANCE;
    },
  };
  const nextServer = {
    after: () => {
      if (state.failures.has("receipt")) throw new Error("Background work unavailable");
      state.steps.push("receipt");
    },
    NextResponse: { json: (data: unknown, init?: ResponseInit) => Response.json(data, init) },
  };
  const postCredit = loadModule("lib/payments/post-credit.ts", {}, { console: logger });
  const common = {
    "@/lib/errors": { ChatSDKError },
    "@/lib/payments/post-credit": postCredit,
    "@/lib/payments/receipts": { deliverReceiptEmail: async () => undefined },
    "next/server": nextServer,
  };
  return { common, logger, queries, rows, state };
}

function razorpayRow(): Row {
  return { amount: 9900, couponId: "00000000-0000-4000-8000-000000000003", currency: "INR", orderId: "order_fixture", planId: PLAN_ID, provider: "razorpay", status: "pending", userId: USER_ID };
}

function razorpayVerify(harness = paymentHarness([razorpayRow()])) {
  const route = loadModule("app/api/billing/razorpay/verify/route.ts", {
    ...harness.common,
    "@/app/(auth)/auth": { auth: async () => ({ user: { id: USER_ID } }) },
    "@/lib/db/queries": harness.queries,
    "@/lib/payments/razorpay": {
      getRazorpayClient: () => ({ orders: { fetch: async () => ({ amount: 9900, currency: "INR", status: "paid" }) } }),
      verifyPaymentSignature: () => true,
    },
  }, { console: harness.logger });
  const call = async () => {
    const response: Response = await route.POST(new Request("https://example.test/api/billing/razorpay/verify", {
      method: "POST", body: JSON.stringify({ orderId: "order_fixture", paymentId: "pay_secret_fixture", signature: "sig_secret_fixture" }),
    }));
    return { status: response.status, body: await response.json() };
  };
  return { ...harness, call };
}

function razorpayWebhook(harness = paymentHarness([razorpayRow()])) {
  const route = loadModule("app/api/billing/razorpay/webhook/route.ts", {
    ...harness.common,
    "@/lib/db/queries": harness.queries,
    "@/lib/payments/razorpay": { verifyWebhookSignature: () => true },
    "@/lib/payments/razorpay-webhook": {
      parseRazorpayPaymentEvent: () => ({ amount: 9900, currency: "INR", event: "payment.captured", orderId: "order_fixture", paymentId: "pay_secret_fixture" }),
    },
  }, { console: harness.logger, process: { env: { RAZORPAY_WEBHOOK_SECRET: "fixture-secret" } } });
  const call = async () => {
    const response: Response = await route.POST(new Request("https://example.test/api/billing/razorpay/webhook", {
      method: "POST", body: "{}", headers: { "x-razorpay-signature": "sig_secret_fixture" },
    }));
    return { status: response.status, body: await response.json() };
  };
  return { ...harness, call };
}

function googlePlayVerify(harness = paymentHarness()) {
  const tokenHash = "f".repeat(64);
  const route = loadModule("app/api/mobile/billing/google-play/verify/route.ts", {
    ...harness.common,
    "drizzle-orm": { eq: () => ({}) },
    "@/lib/db/schema": { user: { id: "id", signupReferralCode: "signupReferralCode" } },
    "@/lib/db/queries": {
      ...harness.queries,
      db: { select: () => ({ from: () => ({ where: async () => [{ code: null }] }) }) },
      getCouponByCode: async () => null,
      getPricingPlanById: async () => ({ id: PLAN_ID, isActive: true, priceInPaise: 9900 }),
      createPaymentTransaction: async (values: Row) => {
        harness.rows.push({ ...values, status: "pending" });
        return { ...values, status: "pending" };
      },
    },
    "@/lib/mobile-auth-session": { getMobileSession: async () => ({ user: { id: USER_ID, role: "regular" } }) },
    "@/lib/payments/google-play": {
      consumeGooglePlayProductPurchase: async () => {
        harness.state.steps.push("consume");
        if (harness.state.failures.has("consume")) throw new ChatSDKError("bad_request:api", "Google Play purchase could not be consumed.");
      },
      getGooglePlayOrderTotal: async () => ({ amount: 9900, currency: "INR" }),
      getGooglePlayPackageName: () => "com.example.app",
      getGooglePlayProductPurchase: async () => ({ orderId: "GPA.0000-0000", purchaseState: 0, purchaseType: 0 }),
      hashGooglePlayPurchaseToken: () => tokenHash,
    },
    "@/lib/payments/google-play-products": { getAndroidProductIdForPlan: () => "credits_99" },
    "@/lib/referrals/settings": { couponsAllowed: async () => false },
  }, { console: harness.logger });
  const call = async () => {
    const response: Response = await route.POST(new Request("https://example.test/api/mobile/billing/google-play/verify", {
      method: "POST", body: JSON.stringify({ planId: PLAN_ID, productId: "credits_99", purchaseToken: "purchase-token-secret" }),
    }));
    return { status: response.status, body: await response.json() };
  };
  return { ...harness, call };
}

type RouteCase = {
  name: string;
  create: () => ReturnType<typeof razorpayVerify>;
  followUps: string[];
  creditFailureStatus: number;
  returnsBalance: boolean;
};

const routes: RouteCase[] = [
  { name: "Razorpay verify", create: () => razorpayVerify(), followUps: ["receipt", "coupon", "balance"], creditFailureStatus: 400, returnsBalance: true },
  { name: "Razorpay webhook", create: () => razorpayWebhook(), followUps: ["receipt", "coupon"], creditFailureStatus: 500, returnsBalance: false },
  { name: "Google Play verify", create: () => googlePlayVerify(), followUps: ["receipt", "read", "coupon", "consume", "balance"], creditFailureStatus: 400, returnsBalance: true },
];

test("markPaymentTransactionFailed only fails orders that have not been credited", async () => {
  const rows: Row[] = ["pending", "processing", "paid", "failed"].map((status) => ({ orderId: `order_${status}`, status }));
  const markFailed = loadMarkFailed(rows);
  for (const row of [...rows]) await markFailed({ orderId: row.orderId });
  expect(rows.map((row) => row.status)).toEqual(["failed", "failed", "paid", "failed"]);
  expect(rows.find((row) => row.orderId === "order_paid")).toEqual({ orderId: "order_paid", status: "paid" });

  const scoped: Row[] = [{ orderId: "order_a", status: "processing" }, { orderId: "order_b", status: "processing" }];
  await loadMarkFailed(scoped)({ orderId: "order_a" });
  expect(scoped.map((row) => row.status)).toEqual(["failed", "processing"]);
});

for (const route of routes) {
  test(`${route.name}: a failed follow-up after crediting still succeeds and never marks the order failed`, async () => {
    for (const failures of [...route.followUps.map((failure) => [failure]), [...route.followUps]]) {
      const harness = route.create();
      for (const failure of failures) harness.state.failures.add(failure);
      const first = await harness.call();
      expect(first.status, `${failures.join("+")} failure`).toBe(200);
      expect(first.body.ok).toBe(true);
      if (route.returnsBalance) expect(first.body.balance).toEqual(failures.includes("balance") ? null : BALANCE);
      expect(harness.state.steps).not.toContain("mark-failed");
      expect(harness.rows[0].status).toBe("paid");
      expect(harness.state.credits).toBe(1);
      // Store acknowledgement never depends on the receipt or coupon record.
      if (route.name === "Google Play verify") expect(harness.state.steps).toContain("consume");

      // A client retry or webhook redelivery sees the paid order and credits nothing more.
      harness.state.failures.clear();
      const retry = await harness.call();
      expect(retry.status).toBe(200);
      expect(retry.body.alreadyProcessed).toBe(true);
      expect(harness.state.credits).toBe(1);

      const logged = JSON.stringify(harness.state.logs.map((entry) => entry.map((part) => part instanceof Error ? part.message : part)));
      for (const secret of SECRETS) expect(logged).not.toContain(secret);
      expect(logged).toContain(harness.rows[0].orderId);
    }
  });

  test(`${route.name}: a failed crediting step still marks the order failed`, async () => {
    const harness = route.create();
    harness.state.failures.add("credit");
    const response = await harness.call();
    expect(response.status).toBe(route.creditFailureStatus);
    expect(response.body.ok ?? false).toBe(false);
    expect(harness.state.steps).toEqual(["mark-failed"]);
    expect(harness.rows[0].status).toBe("failed");
    expect(harness.state.credits).toBe(0);
  });

  test(`${route.name}: a crediting error after commit cannot demote the paid order or credit it twice`, async () => {
    const harness = route.create();
    harness.state.failures.add("lost-ack");
    const response = await harness.call();
    expect(response.status).toBe(route.creditFailureStatus);
    expect(harness.state.steps).toEqual(["mark-failed"]);
    expect(harness.rows[0].status).toBe("paid");

    harness.state.failures.clear();
    const retry = await harness.call();
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ alreadyProcessed: true, ok: true });
    expect(harness.state.credits).toBe(1);
  });
}
