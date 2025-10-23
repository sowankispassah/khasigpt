import Razorpay from "razorpay";
import { createHmac } from "crypto";

import { ChatSDKError } from "@/lib/errors";

type RazorpayClient = InstanceType<typeof Razorpay>;

let razorpayClient: RazorpayClient | null = null;

function ensureEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new ChatSDKError(
      "bad_request:configuration",
      `Missing ${name} for Razorpay integration.`
    );
  }

  return value;
}

export function getRazorpayKeyId() {
  return ensureEnv(process.env.RAZORPAY_KEY_ID, "RAZORPAY_KEY_ID");
}

function getRazorpayKeySecret() {
  return ensureEnv(process.env.RAZORPAY_KEY_SECRET, "RAZORPAY_KEY_SECRET");
}

export function getRazorpayClient() {
  if (razorpayClient) {
    return razorpayClient;
  }

  razorpayClient = new Razorpay({
    key_id: getRazorpayKeyId(),
    key_secret: getRazorpayKeySecret(),
  });

  return razorpayClient;
}

export function verifyPaymentSignature({
  orderId,
  paymentId,
  signature,
}: {
  orderId: string;
  paymentId: string;
  signature: string;
}) {
  const hmac = createHmac("sha256", getRazorpayKeySecret());
  hmac.update(`${orderId}|${paymentId}`);

  const digest = hmac.digest("hex");

  return digest === signature;
}
