"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";

import {
  createAuditLogEntry,
  createEmailVerificationTokenRecord,
  createUser,
  deleteEmailVerificationTokensForUser,
  getUser,
  updateUserActiveState,
  updateUserPassword,
  updateUserProfile,
} from "@/lib/db/queries";
import { sendVerificationEmail } from "@/lib/email/brevo";
import { getClientInfoFromHeaders } from "@/lib/security/client-info";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";
import { withTimeout } from "@/lib/utils/async";
import { signIn } from "./auth";

const authFormSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const REGISTER_RATE_LIMIT = {
  limit: 5,
  windowMs: 10 * 60 * 1000,
};
const AUTH_ACTION_DB_TIMEOUT_MS = 4000;

async function runAuthActionDb<T>(
  label: string,
  promise: Promise<T>,
  timeoutMs = AUTH_ACTION_DB_TIMEOUT_MS
) {
  return withTimeout(promise, timeoutMs, () => {
    console.warn(`[auth/actions] ${label} timed out after ${timeoutMs}ms.`);
  });
}

async function allowRegisterAttempt(email: string) {
  const headerStore = await headers();
  const clientKey = getClientKeyFromHeaders(headerStore);
  const normalizedEmail = email.trim().toLowerCase();

  const [ipResult, emailResult] = await Promise.all([
    incrementRateLimit(`register:ip:${clientKey}`, REGISTER_RATE_LIMIT),
    incrementRateLimit(`register:email:${normalizedEmail}`, REGISTER_RATE_LIMIT),
  ]);

  return ipResult.allowed && emailResult.allowed;
}

export type LoginActionState = {
  status:
    | "idle"
    | "in_progress"
    | "success"
    | "failed"
    | "invalid_data"
    | "inactive";
};

export const login = async (
  _: LoginActionState,
  formData: FormData
): Promise<LoginActionState> => {
  try {
    const validatedData = authFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    const result = await signIn("credentials", {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    if (result?.error === "AccountInactive") {
      return { status: "inactive" };
    }

    if (result?.error) {
      return { status: "failed" };
    }

    return { status: "success" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
    }

    if (error instanceof Error && error.message === "AccountInactive") {
      return { status: "inactive" };
    }

    return { status: "failed" };
  }
};

export type RegisterActionState = {
  status:
    | "idle"
    | "in_progress"
    | "verification_sent"
    | "failed"
    | "user_exists"
    | "invalid_data"
    | "terms_unaccepted"
    | "rate_limited";
};

export const register = async (
  _: RegisterActionState,
  formData: FormData
): Promise<RegisterActionState> => {
  try {
    const acceptTerms = formData.get("acceptTerms") === "on";
    if (!acceptTerms) {
      return { status: "terms_unaccepted" };
    }

    const validatedData = authFormSchema.parse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    const isAllowed = await allowRegisterAttempt(validatedData.email);
    if (!isAllowed) {
      return { status: "rate_limited" };
    }

    const [existingUser] = await runAuthActionDb(
      "register.user_lookup",
      getUser(validatedData.email)
    );

    if (existingUser?.isActive) {
      return { status: "user_exists" };
    }

    let userRecord = existingUser;

    if (userRecord) {
      await runAuthActionDb(
        "register.update_existing_password",
        updateUserPassword({
          id: userRecord.id,
          password: validatedData.password,
        })
      );
    } else {
      userRecord = await runAuthActionDb(
        "register.create_user",
        createUser(validatedData.email, validatedData.password)
      );
    }

    const clientInfo = await getClientInfoFromHeaders();
    await runAuthActionDb(
      "register.audit",
      createAuditLogEntry({
        actorId: userRecord.id,
        action: "user.signup",
        target: { userId: userRecord.id, email: validatedData.email },
        metadata: {
          provider: "credentials",
          reactivated: Boolean(existingUser),
        },
        subjectUserId: userRecord.id,
        ...clientInfo,
      }),
      3000
    );

    if (process.env.PLAYWRIGHT === "true") {
      await runAuthActionDb(
        "register.playwright_activate",
        updateUserActiveState({ id: userRecord.id, isActive: true })
      );
      await runAuthActionDb(
        "register.playwright_profile",
        updateUserProfile({
          id: userRecord.id,
          dateOfBirth: "1990-01-01",
          firstName: "Playwright",
          lastName: "User",
        })
      );
      return { status: "verification_sent" };
    }

    await runAuthActionDb(
      "register.delete_old_verification_tokens",
      deleteEmailVerificationTokensForUser({ userId: userRecord.id })
    );

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

    await runAuthActionDb(
      "register.create_verification_token",
      createEmailVerificationTokenRecord({
        userId: userRecord.id,
        token,
        expiresAt,
      })
    );

    const baseUrl =
      process.env.APP_BASE_URL ??
      process.env.NEXTAUTH_URL ??
      process.env.NEXT_PUBLIC_APP_URL;

    if (!baseUrl) {
      throw new Error(
        "APP_BASE_URL (or NEXTAUTH_URL / NEXT_PUBLIC_APP_URL) is not configured"
      );
    }

    const verificationUrl = new URL(
      `/verify-email?token=${token}`,
      baseUrl
    ).toString();

    await sendVerificationEmail({
      toEmail: validatedData.email,
      toName: validatedData.email,
      verificationUrl,
    });

    return { status: "verification_sent" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
    }

    console.error("Failed to register user", error);
    return { status: "failed" };
  }
};
