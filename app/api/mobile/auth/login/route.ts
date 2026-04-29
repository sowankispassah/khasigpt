import { compare } from "bcrypt-ts";
import { NextResponse } from "next/server";
import { z } from "zod";
import { DUMMY_PASSWORD } from "@/lib/constants";
import { getUser } from "@/lib/db/queries";
import { createMobileSessionFromUser } from "@/lib/mobile-auth-session";
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

function authError(message: string, status: number) {
  return NextResponse.json(
    {
      code: status === 429 ? "rate_limit:auth" : "unauthorized:auth",
      message,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        code: "bad_request:auth",
        message: "Enter a valid email and password.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const rateLimitKey = `mobile-login:${email || "unknown"}`;
  const { allowed } = await incrementRateLimit(rateLimitKey, {
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });

  if (!allowed) {
    await compare(parsed.data.password, DUMMY_PASSWORD);
    return authError("Too many login attempts. Please try again later.", 429);
  }

  const [user] = await getUser(email);
  if (!user?.password) {
    await compare(parsed.data.password, DUMMY_PASSWORD);
    return authError("Invalid credentials. Please try again.", 401);
  }

  const passwordsMatch = await compare(parsed.data.password, user.password);
  if (!passwordsMatch) {
    return authError("Invalid credentials. Please try again.", 401);
  }

  if (!user.isActive) {
    return NextResponse.json(
      {
        code: "forbidden:auth",
        message: "Your account is inactive.",
      },
      {
        status: 403,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  resetRateLimit(rateLimitKey);

  return NextResponse.json(
    {
      token: createMobileAuthToken(user.id, { persistent: true }),
      session: createMobileSessionFromUser(user),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
