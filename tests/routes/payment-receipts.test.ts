import { mkdir, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { sendPaymentReceiptEmail } from "@/lib/email/brevo";
import { buildReceiptData, receiptAmount, receiptEmailKey } from "@/lib/payments/receipt-data";
import { createReceiptPdf } from "@/lib/payments/receipt-pdf";

const receipt = buildReceiptData({ orderId: "order_receipt_fixture", paymentId: "pay_fixture", paidAt: new Date("2026-10-06T10:00:00.000Z"), email: "receipt@example.test", name: "Söwan Passah", planName: "Premium plan", amount: 49900, currency: "INR", provider: "razorpay", notes: null });

test("generates a readable PDF with a stable receipt reference", async () => {
  const pdf = await createReceiptPdf(receipt);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  const parsed = await PDFDocument.load(pdf);
  expect(parsed.getPageCount()).toBe(1);
  expect(parsed.getTitle()).toContain(receipt.number);
  await mkdir("tmp/pdfs", { recursive: true });
  await writeFile("tmp/pdfs/receipt-preview.pdf", pdf);
});

test("uses paid amounts and currency subunits, and rejects unverified Google totals", async () => {
  expect(receiptAmount(receipt)).toContain("499.00");
  expect(receiptAmount({ ...receipt, currency: "JPY", amount: 500 })).toContain("500");
  const google = buildReceiptData({ ...receipt, paidAt: new Date(receipt.paidAt), provider: "google_play", notes: {} });
  await expect(createReceiptPdf(google)).rejects.toThrow("not verified");
  const sandbox = buildReceiptData({ ...receipt, paidAt: new Date(receipt.paidAt), provider: "google_play", notes: { commissionEligible: false } });
  expect(sandbox.amount).toBe(0);
  expect(sandbox.testPurchase).toBe(true);
  expect(sandbox.amountVerified).toBe(true);
});

test("emails the PDF attachment, escapes dynamic HTML and reports delivery failures", async () => {
  const originalFetch = globalThis.fetch;
  const apiKey = process.env.BREVO_API_KEY;
  const sender = process.env.BREVO_SENDER_EMAIL;
  process.env.BREVO_API_KEY = "fixture-key";
  process.env.BREVO_SENDER_EMAIL = "support@example.test";
  let payload: Record<string, any> = {};
  globalThis.fetch = async (_input, init) => { payload = JSON.parse(String(init?.body)); return new Response("{}", { status: 201 }); };
  try {
    const pdf = await createReceiptPdf(receipt);
    await sendPaymentReceiptEmail({ receipt: { ...receipt, planName: "<script>bad</script>" }, pdf });
    expect(payload.to).toEqual([{ email: receipt.email }]);
    expect(Buffer.from(payload.attachment[0].content, "base64").equals(pdf)).toBe(true);
    expect(payload.htmlContent).not.toContain("<script>");
    expect(payload.htmlContent).toContain("&lt;script&gt;");
    expect(payload.headers.idempotencyKey).toBe(receiptEmailKey(receipt.orderId));
    expect(payload.headers.idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    globalThis.fetch = async () => new Response(JSON.stringify({ code: "duplicate_parameter" }), { status: 400 });
    await sendPaymentReceiptEmail({ receipt, pdf });
    globalThis.fetch = async () => new Response("{}", { status: 503 });
    await expect(sendPaymentReceiptEmail({ receipt, pdf })).rejects.toThrow("503");
  } finally {
    globalThis.fetch = originalFetch;
    if (apiKey === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = apiKey;
    if (sender === undefined) delete process.env.BREVO_SENDER_EMAIL; else process.env.BREVO_SENDER_EMAIL = sender;
  }
});
