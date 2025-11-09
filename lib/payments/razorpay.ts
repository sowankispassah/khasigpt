import Razorpay from "razorpay";
import { createHmac } from "crypto";

import { ChatSDKError } from "@/lib/errors";

type RazorpayClient = InstanceType<typeof Razorpay>;
type RazorpayMode = "live" | "test";

let razorpayClient: RazorpayClient | null = null;
let cachedKeys: {
  mode: RazorpayMode;
  keyId: string;
  keySecret: string;
} | null = null;

function ensureEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new ChatSDKError(
      "bad_request:configuration",
      `Missing ${name} for Razorpay integration.`
    );
  }

  return value;
}

function resolveMode(): RazorpayMode {
  const explicit = process.env.RAZORPAY_MODE;
  if (explicit === "test" || explicit === "live") {
    return explicit;
  }
  return process.env.NODE_ENV === "production" ? "live" : "test";
}

function getRazorpayKeys() {
  if (cachedKeys) {
    return cachedKeys;
  }

  const mode = resolveMode();
  const keyId =
    mode === "test"
      ? process.env.RAZORPAY_TEST_KEY_ID ?? process.env.RAZORPAY_KEY_ID
      : process.env.RAZORPAY_KEY_ID;
  const keySecret =
    mode === "test"
      ? process.env.RAZORPAY_TEST_KEY_SECRET ?? process.env.RAZORPAY_KEY_SECRET
      : process.env.RAZORPAY_KEY_SECRET;

  cachedKeys = {
    mode,
    keyId: ensureEnv(
      keyId,
      mode === "test" ? "RAZORPAY_TEST_KEY_ID" : "RAZORPAY_KEY_ID"
    ),
    keySecret: ensureEnv(
      keySecret,
      mode === "test" ? "RAZORPAY_TEST_KEY_SECRET" : "RAZORPAY_KEY_SECRET"
    ),
  };

  return cachedKeys;
}

export function getRazorpayKeyId() {
  return getRazorpayKeys().keyId;
}

function getRazorpayKeySecret() {
  return getRazorpayKeys().keySecret;
}

export function getRazorpayClient() {
  if (razorpayClient) {
    return razorpayClient;
  }

  const { keyId, keySecret } = getRazorpayKeys();

  razorpayClient = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
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
