"use server";

import { randomBytes } from "node:crypto";

import { z } from "zod";

import {
  createEmailVerificationTokenRecord,
  createUser,
  deleteEmailVerificationTokensForUser,
  getUser,
  updateUserPassword,
} from "@/lib/db/queries";
import { sendVerificationEmail } from "@/lib/email/brevo";
import { signIn } from "./auth";

const authFormSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type LoginActionState = {
  status: "idle" | "in_progress" | "success" | "failed" | "invalid_data";
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

    await signIn("credentials", {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    return { status: "success" };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: "invalid_data" };
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
    | "terms_unaccepted";
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

    const [existingUser] = await getUser(validatedData.email);

    if (existingUser && existingUser.isActive) {
      return { status: "user_exists" };
    }

    let userRecord = existingUser;

    if (!userRecord) {
      userRecord = await createUser(
        validatedData.email,
        validatedData.password
      );
    } else {
      await updateUserPassword({
        id: userRecord.id,
        password: validatedData.password,
      });
    }

    await deleteEmailVerificationTokensForUser({ userId: userRecord.id });

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

    await createEmailVerificationTokenRecord({
      userId: userRecord.id,
      token,
      expiresAt,
    });

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
