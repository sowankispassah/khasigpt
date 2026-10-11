"use server";

import { z } from "zod";
import {
  type VerifyEmailResult,
  verifyUserEmailByToken,
} from "@/lib/db/queries";
import { withTimeout } from "@/lib/utils/async";

export type VerifyEmailActionState = {
  status: "idle" | "failed" | VerifyEmailResult["status"];
};

const tokenSchema = z.string().trim().min(1).max(128);
const VERIFY_EMAIL_DB_TIMEOUT_MS = 5000;

// Verification happens only on this explicit POST. Mail scanners prefetch GET
// links, so verifying while the page renders would activate signups that the
// mailbox owner never confirmed. The proxy rate-limits Server Actions.
export async function confirmEmailVerificationAction(
  _prevState: VerifyEmailActionState,
  formData: FormData
): Promise<VerifyEmailActionState> {
  const token = tokenSchema.safeParse(formData.get("token"));
  if (!token.success) {
    return { status: "not_found" };
  }

  try {
    const result = await withTimeout(
      verifyUserEmailByToken(token.data),
      VERIFY_EMAIL_DB_TIMEOUT_MS
    );
    // Return only the status; the query result carries the full User row.
    return { status: result.status };
  } catch {
    console.warn("[auth.verify_email] Verification unavailable.");
    return { status: "failed" };
  }
}
