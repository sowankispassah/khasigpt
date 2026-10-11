"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { resetAuthUserPassword } from "@/lib/db/auth-queries";
import {
  createPasswordResetTokenRecord,
  deletePasswordResetTokensForUser,
  getUser,
} from "@/lib/db/queries";
import { sendPasswordResetEmail } from "@/lib/email/brevo";
import { allowAuthEmailAttempt } from "@/lib/security/auth-email-rate-limit";
import { newPasswordSchema } from "@/lib/security/password-change";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";
import { withTimeout } from "@/lib/utils/async";

const emailSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z
  .object({
    token: z.string().min(1).max(256),
    password: newPasswordSchema,
    confirmPassword: z.string().min(8).max(72),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

const PASSWORD_RESET_EXPIRY_MS = 1000 * 60 * 60; // 1 hour
const PASSWORD_RESET_DB_TIMEOUT_MS = 4000;

async function runPasswordResetDb<T>(
  label: string,
  promise: Promise<T>,
  timeoutMs = PASSWORD_RESET_DB_TIMEOUT_MS
) {
  return withTimeout(promise, timeoutMs, () => {
    console.warn(
      `[password-reset] ${label} timed out after ${timeoutMs}ms.`
    );
  });
}

export type ForgotPasswordState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export type ResetPasswordState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string; code?: string };

function resolveAppBaseUrl(): string {
  const baseUrl =
    process.env.APP_BASE_URL ??
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL;

  if (!baseUrl) {
    throw new Error(
      "APP_BASE_URL (or NEXTAUTH_URL / NEXT_PUBLIC_APP_URL) is not configured"
    );
  }

  return baseUrl;
}

async function allowPasswordResetAttempt(email: string) {
  const headerStore = await headers();
  return allowAuthEmailAttempt({
    clientKey: getClientKeyFromHeaders(headerStore),
    email,
    kind: "password-reset",
  });
}

export async function requestPasswordResetAction(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  try {
    const { email } = emailSchema.parse({
      email: formData.get("email"),
    });

    const isAllowed = await allowPasswordResetAttempt(email);
    if (!isAllowed) {
      return {
        status: "error",
        message: "Too many password reset requests. Please try again later.",
      };
    }

    const [user] = await runPasswordResetDb("request.user_lookup", getUser(email));

    if (!user) {
      return {
        status: "success",
        message:
          "If an account exists for that email, a reset link has been sent.",
      };
    }

    await runPasswordResetDb(
      "request.delete_old_tokens",
      deletePasswordResetTokensForUser({ userId: user.id })
    );

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);

    await runPasswordResetDb(
      "request.create_token",
      createPasswordResetTokenRecord({
        userId: user.id,
        token,
        expiresAt,
      })
    );

    const resetUrl = new URL(
      `/reset-password?token=${token}`,
      resolveAppBaseUrl()
    ).toString();

    await sendPasswordResetEmail({
      toEmail: user.email,
      toName: user.email,
      resetUrl,
    });

    return {
      status: "success",
      message:
        "If an account exists for that email, a reset link has been sent.",
    };
  } catch (error) {
    console.error("Failed to initiate password reset", error);
    return {
      status: "error",
      message: "Something went wrong. Please try again later.",
    };
  }
}

export async function resetPasswordAction(
  _prevState: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  try {
    const { token, password } = resetSchema.parse({
      token: formData.get("token"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
    });

    const { allowed } = await incrementRateLimit(`password-reset-confirm:${getClientKeyFromHeaders(await headers())}`, { limit: 10, windowMs: 10 * 60 * 1000 });
    if (!allowed) return { status: "error", code: "reset_password.rate_limited", message: "Too many reset attempts. Please try again later." };
    const updated = await runPasswordResetDb("reset.consume_and_revoke", resetAuthUserPassword(token, password), 5000);
    if (!updated) return { status: "error", code: "reset_password.invalid_link", message: "This reset link is invalid, expired, or has already been used." };

    return {
      status: "success",
      message: "Password updated. You can now sign in with your new password.",
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues[0]?.message ?? "Invalid input.";
      return { status: "error", message };
    }

    console.warn("[auth.password] Reset unavailable.");
    return {
      status: "error",
      message: "Something went wrong. Please try again later.",
    };
  }
}
