import { NextResponse } from "next/server";
import { z } from "zod";
import { signIn } from "@/app/(auth)/auth";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

const ONE_MINUTE = 60 * 1000;
const MOBILE_AUTH_RATE_LIMIT = {
  limit: 10,
  windowMs: 10 * ONE_MINUTE,
};

const requestSchema = z.object({
  idToken: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "missing_token" },
      { status: 400 }
    );
  }

  const clientKey = getClientKeyFromHeaders(request.headers);
  const { allowed, resetAt } = await incrementRateLimit(
    `mobile:auth:google:${clientKey}`,
    MOBILE_AUTH_RATE_LIMIT
  );
  if (!allowed) {
    const retryAfter = Math.max(
      Math.ceil((resetAt - Date.now()) / 1000),
      1
    ).toString();
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": retryAfter },
      }
    );
  }

  const result = (await signIn("google-native", {
    idToken: parsed.data.idToken,
    redirect: false,
  })) as { error?: string } | undefined;

  if (result?.error) {
    const error =
      result.error === "AccountInactive"
        ? "account_inactive"
        : result.error === "AccountLinkRequired"
          ? "account_link_required"
          : "unauthorized";
    return NextResponse.json({ error }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
