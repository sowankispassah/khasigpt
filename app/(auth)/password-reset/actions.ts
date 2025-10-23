"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";

import {
  createPasswordResetTokenRecord,
  deletePasswordResetTokenById,
  deletePasswordResetTokensForUser,
  getPasswordResetTokenRecord,
  getUser,
  getUserById,
  updateUserPassword,
} from "@/lib/db/queries";
import { sendPasswordResetEmail } from "@/lib/email/brevo";

const emailSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

const PASSWORD_RESET_EXPIRY_MS = 1000 * 60 * 60; // 1 hour

export type ForgotPasswordState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export type ResetPasswordState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

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

export async function requestPasswordResetAction(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  try {
    const { email } = emailSchema.parse({
      email: formData.get("email"),
    });

    const [user] = await getUser(email);

    if (!user) {
      return {
        status: "success",
        message:
          "If an account exists for that email, a reset link has been sent.",
      };
    }

    await deletePasswordResetTokensForUser({ userId: user.id });

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MS);

    await createPasswordResetTokenRecord({
      userId: user.id,
      token,
      expiresAt,
    });

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

    const record = await getPasswordResetTokenRecord(token);

    if (!record) {
      return {
        status: "error",
        message: "This reset link is invalid or has already been used.",
      };
    }

    if (record.expiresAt < new Date()) {
      await deletePasswordResetTokenById({ id: record.id });
      return {
        status: "error",
        message: "This reset link has expired. Please request a new one.",
      };
    }

    const userRecord = await getUserById(record.userId);

    if (!userRecord) {
      await deletePasswordResetTokenById({ id: record.id });
      return {
        status: "error",
        message: "The account associated with this link could not be found.",
      };
    }

    await updateUserPassword({ id: userRecord.id, password });
    await deletePasswordResetTokensForUser({ userId: userRecord.id });

    return {
      status: "success",
      message: "Password updated. You can now sign in with your new password.",
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues[0]?.message ?? "Invalid input.";
      return { status: "error", message };
    }

    console.error("Failed to reset password", error);
    return {
      status: "error",
      message: "Something went wrong. Please try again later.",
    };
  }
}
