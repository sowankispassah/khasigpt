import "server-only";
import { z } from "zod";
import { changeAuthUserPassword } from "@/lib/db/auth-queries";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { withTimeout } from "@/lib/utils/async";

export const newPasswordSchema = z.string().min(8).max(72)
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72);

const schema = z.object({ currentPassword: z.string().min(1).max(256),
  password: newPasswordSchema, confirmPassword: z.string().min(8).max(72) })
  .refine((value) => value.password === value.confirmPassword);

const errors = {
  invalid: "Enter your current password and matching new passwords of 8 to 72 bytes.",
  current_invalid: "The current password is incorrect.",
  reset_required: "Use Forgot password to set a password for this account.",
  session_changed: "Your session has changed. Sign in again before updating your password.",
  rate_limited: "Too many password change attempts. Please try again later.",
  error: "Unable to update password. Please try again later.",
} as const;

export async function performPasswordChange(id: string, sessionVersion: number, input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, code: "invalid", error: errors.invalid, status: 400 };
  const { allowed } = await incrementRateLimit(`password-change:${id}`, { limit: 5, windowMs: 10 * 60 * 1000 });
  if (!allowed) return { ok: false as const, code: "rate_limited", error: errors.rate_limited, status: 429 };
  try {
    const result = await withTimeout(changeAuthUserPassword({ id, sessionVersion, ...parsed.data }), 5000);
    if (result === "success") return { ok: true as const };
    return { ok: false as const, code: result, error: errors[result], status: result === "session_changed" ? 401 : 400 };
  } catch {
    console.warn("[auth.password] Credential update unavailable.");
    return { ok: false as const, code: "error", error: errors.error, status: 503 };
  }
}
