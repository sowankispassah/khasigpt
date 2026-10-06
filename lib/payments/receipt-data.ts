import { createHash } from "node:crypto";
import { z } from "zod";

export const receiptDataSchema = z.object({
  number: z.string().min(1).max(64),
  orderId: z.string().min(1).max(64),
  paymentId: z.string().max(128).nullable(),
  paidAt: z.string().datetime(),
  email: z.string().email(),
  name: z.string().max(200),
  planName: z.string().min(1).max(256),
  amount: z.number().int().nonnegative().safe(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  provider: z.string(),
  amountVerified: z.boolean(),
  testPurchase: z.boolean(),
});

export type ReceiptData = z.infer<typeof receiptDataSchema>;

export function receiptNumber(orderId: string) {
  return `KG-${createHash("sha256").update(orderId).digest("hex").slice(0, 20).toUpperCase()}`;
}

export function receiptEmailKey(orderId: string) {
  const hex = createHash("sha256").update(`receipt-email:${orderId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function receiptFilename(receipt: ReceiptData) {
  return `KhasiGPT-receipt-${receipt.number}.pdf`;
}

export function receiptAmount(receipt: ReceiptData) {
  const digits = new Intl.NumberFormat("en", { style: "currency", currency: receipt.currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: receipt.currency }).format(receipt.amount / 10 ** digits);
}

export function buildReceiptData(input: {
  orderId: string; paymentId: string | null; paidAt: Date;
  email: string; name: string; planName: string; amount: number;
  currency: string; provider: string; notes: unknown;
}): ReceiptData {
  const notes = input.notes && typeof input.notes === "object" ? input.notes as Record<string, unknown> : {};
  const testPurchase = input.provider === "google_play" && (notes.testPurchase === true || notes.commissionEligible === false);
  return receiptDataSchema.parse({
    ...input, number: receiptNumber(input.orderId), paidAt: input.paidAt.toISOString(),
    currency: input.currency.toUpperCase(), amount: testPurchase ? 0 : input.amount,
    amountVerified: input.provider !== "google_play" || testPurchase || notes.receiptAmountVerified === true,
    testPurchase,
  });
}
