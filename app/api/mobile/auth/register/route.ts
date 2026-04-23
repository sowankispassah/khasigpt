import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createAuditLogEntry,
  createEmailVerificationTokenRecord,
  createUser,
  deleteEmailVerificationTokensForUser,
  getUser,
  updateUserPassword,
} from "@/lib/db/queries";
import { sendVerificationEmail } from "@/lib/email/brevo";
import { getClientInfoFromHeaders } from "@/lib/security/client-info";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

export const runtime = "nodejs";

const registerSchema = z.object({
  acceptTerms: z.boolean(),
  email: z.string().email(),
  password: z.string().min(6),
});

const REGISTER_RATE_LIMIT = {
  limit: 5,
  windowMs: 10 * 60 * 1000,
};

async function allowRegisterAttempt(request: Request, email: string) {
  const clientKey = getClientKeyFromHeaders(request.headers);
  const normalizedEmail = email.trim().toLowerCase();
  const [ipResult, emailResult] = await Promise.all([
    incrementRateLimit(`register:ip:${clientKey}`, REGISTER_RATE_LIMIT),
    incrementRateLimit(`register:email:${normalizedEmail}`, REGISTER_RATE_LIMIT),
  ]);

  return ipResult.allowed && emailResult.allowed;
}

export async function POST(request: Request) {
  try {
    const payload = registerSchema.parse(await request.json());
    if (!payload.acceptTerms) {
      return NextResponse.json({ status: "terms_unaccepted" }, { status: 400 });
    }

    const allowed = await allowRegisterAttempt(request, payload.email);
    if (!allowed) {
      return NextResponse.json({ status: "rate_limited" }, { status: 429 });
    }

    const [existingUser] = await getUser(payload.email);
    if (existingUser?.isActive) {
      return NextResponse.json({ status: "user_exists" }, { status: 409 });
    }

    const userRecord =
      existingUser ??
      (await createUser(payload.email.trim().toLowerCase(), payload.password));

    if (existingUser) {
      await updateUserPassword({
        id: existingUser.id,
        password: payload.password,
      });
    }

    const clientInfo = await getClientInfoFromHeaders();
    await createAuditLogEntry({
      actorId: userRecord.id,
      action: "user.signup",
      target: { userId: userRecord.id, email: payload.email },
      metadata: {
        provider: "credentials",
        reactivated: Boolean(existingUser),
        client: "native",
      },
      subjectUserId: userRecord.id,
      ...clientInfo,
    });

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

    await sendVerificationEmail({
      toEmail: payload.email,
      toName: payload.email,
      verificationUrl: new URL(`/verify-email?token=${token}`, baseUrl).toString(),
    });

    return NextResponse.json({ status: "verification_sent" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ status: "invalid_data" }, { status: 400 });
    }
    console.error("[api/mobile/auth/register] Failed to register user.", error);
    return NextResponse.json({ status: "failed" }, { status: 500 });
  }
}
