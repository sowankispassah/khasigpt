import { compare } from "bcrypt-ts";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiTiming } from "@/lib/api/observability";
import { DUMMY_PASSWORD } from "@/lib/constants";
import { getUser } from "@/lib/db/queries";
import { createMobileSessionFromUser } from "@/lib/mobile-auth-session";
import { createMobileAuthToken } from "@/lib/mobile-auth-token";
import {
  incrementRateLimit,
  resetRateLimit,
} from "@/lib/security/rate-limit";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

function authError(message: string, status: number, code?: string) {
  return NextResponse.json(
    {
      code:
        code ??
        (status === 429 ? "rate_limit:auth" : "unauthorized:auth"),
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

function getEmailDomain(email: string) {
  return email.split("@")[1]?.toLowerCase() ?? "unknown";
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
  const { allowed } = await withApiTiming(
    "mobile.auth.login.rate_limit",
    () =>
      incrementRateLimit(rateLimitKey, {
        limit: 5,
        windowMs: 10 * 60 * 1000,
      }),
    {
      metadata: {
        emailDomain: getEmailDomain(email),
      },
      slowMs: 300,
    }
  );

  if (!allowed) {
    await compare(parsed.data.password, DUMMY_PASSWORD);
    return authError("Too many login attempts. Please try again later.", 429);
  }

  let userRecords: Awaited<ReturnType<typeof getUser>>;
  try {
    userRecords = await withApiTiming(
      "mobile.auth.login.user_lookup",
      () =>
        withTimeout(getUser(email), 5000, () => {
          console.warn("[mobile-auth] User lookup timed out.", {
            emailDomain: getEmailDomain(email),
          });
        }),
      {
        metadata: {
          emailDomain: getEmailDomain(email),
        },
        slowMs: 500,
      }
    );
  } catch (error) {
    console.error("[mobile-auth] User lookup failed.", {
      emailDomain: getEmailDomain(email),
      error: error instanceof Error ? error.message : String(error),
    });
    await compare(parsed.data.password, DUMMY_PASSWORD);
    return authError(
      "Sign in is temporarily unavailable. Please try again.",
      503,
      "unavailable:auth"
    );
  }

  const [user] = userRecords;
  if (!user?.password) {
    await compare(parsed.data.password, DUMMY_PASSWORD);
    return authError("Invalid credentials. Please try again.", 401);
  }

  const passwordHash = user.password;
  const passwordsMatch = await withApiTiming(
    "mobile.auth.login.password_check",
    () => compare(parsed.data.password, passwordHash),
    { slowMs: 1000 }
  );
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
