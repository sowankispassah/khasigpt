import { compare } from "bcrypt-ts";
import { NextResponse } from "next/server";
import { z } from "zod";
import { DUMMY_PASSWORD } from "@/lib/constants";
import { getUser } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { createMobileAuthToken } from "@/lib/mobile-auth-token";
import {
  incrementRateLimit,
  resetRateLimit,
} from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return new ChatSDKError(
      "bad_request:auth",
      "Enter a valid email and password."
    ).toResponse();
  }

  const email = parsed.data.email.trim().toLowerCase();
  const rateLimitKey = `mobile-login:${email || "unknown"}`;
  const { allowed } = await incrementRateLimit(rateLimitKey, {
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });

  if (!allowed) {
    await compare(parsed.data.password, DUMMY_PASSWORD);
    return new ChatSDKError(
      "rate_limit:auth",
      "Too many login attempts. Please try again later."
    ).toResponse();
  }

  const [user] = await getUser(email);
  if (!user?.password) {
    await compare(parsed.data.password, DUMMY_PASSWORD);
    return new ChatSDKError(
      "unauthorized:auth",
      "Invalid credentials. Please try again."
    ).toResponse();
  }

  const passwordsMatch = await compare(parsed.data.password, user.password);
  if (!passwordsMatch) {
    return new ChatSDKError(
      "unauthorized:auth",
      "Invalid credentials. Please try again."
    ).toResponse();
  }

  if (!user.isActive) {
    return new ChatSDKError(
      "forbidden:auth",
      "Your account is inactive."
    ).toResponse();
  }

  resetRateLimit(rateLimitKey);

  return NextResponse.json(
    {
      token: createMobileAuthToken(user.id, { persistent: true }),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
