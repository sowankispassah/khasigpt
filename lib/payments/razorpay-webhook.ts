export type RazorpayPaymentEvent = {
  event: "order.paid" | "payment.captured";
  orderId: string;
  paymentId: string;
  /** Order total (order.paid) or captured amount, in currency subunits. */
  amount: number;
  currency: string;
};

const ORDER_ID_PATTERN = /^order_[A-Za-z0-9]{1,60}$/;
const PAYMENT_ID_PATTERN = /^pay_[A-Za-z0-9]{1,60}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readEntity(container: unknown) {
  return isRecord(container) && isRecord(container.entity)
    ? container.entity
    : null;
}

/**
 * Extracts a completed payment from a signature-verified Razorpay webhook
 * body. Returns null for events that do not confirm a captured payment.
 */
export function parseRazorpayPaymentEvent(
  body: unknown
): RazorpayPaymentEvent | null {
  if (!isRecord(body)) {
    return null;
  }
  const { event } = body;
  if (event !== "payment.captured" && event !== "order.paid") {
    return null;
  }

  const payload = isRecord(body.payload) ? body.payload : null;
  const payment = readEntity(payload?.payment);
  const order = readEntity(payload?.order);
  if (!payment) {
    return null;
  }
  if (event === "payment.captured" && payment.status !== "captured") {
    return null;
  }
  if (event === "order.paid" && order?.status !== "paid") {
    return null;
  }

  const orderId = payment.order_id ?? order?.id;
  const paymentId = payment.id;
  const amount = order ? order.amount : payment.amount;
  const currency = order ? order.currency : payment.currency;
  if (
    typeof orderId !== "string" ||
    !ORDER_ID_PATTERN.test(orderId) ||
    typeof paymentId !== "string" ||
    !PAYMENT_ID_PATTERN.test(paymentId) ||
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    typeof currency !== "string"
  ) {
    return null;
  }

  return { event, orderId, paymentId, amount, currency };
}
