/**
 * Runs follow-up work (receipt, coupon record, balance read, store
 * acknowledgement) for an order whose credit has already committed.
 *
 * A failure is logged by order id only and resolves to null. It must never
 * reach the crediting step's catch, which marks the order failed: a failed
 * order can be locked and credited again.
 */
export async function runPostCreditStep<T>(
  orderId: string,
  step: string,
  work: () => T | Promise<T>
): Promise<T | null> {
  try {
    return await work();
  } catch {
    console.error("[payments] Follow-up after crediting failed", {
      orderId,
      step,
    });
    return null;
  }
}
