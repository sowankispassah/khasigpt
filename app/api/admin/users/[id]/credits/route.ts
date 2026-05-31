import { type NextRequest, NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/api/cache";
import { TOKENS_PER_CREDIT } from "@/lib/constants";
import { createAuditLogEntry, grantUserCredits } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";
export const maxDuration = 30;

const ADMIN_USER_CREDIT_GRANT_TIMEOUT_MS = 8_000;
const ADMIN_USER_CREDIT_AUDIT_TIMEOUT_MS = 3_000;

function parsePositiveNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function parsePositiveInteger(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0
    ? Math.floor(numberValue)
    : fallback;
}

function grantCreditsErrorMessage(error: unknown) {
  if (error instanceof ChatSDKError) {
    return error.cause ?? error.message;
  }

  if (error instanceof Error && error.message === "timeout") {
    return "Credit grant timed out. Please refresh this user row before retrying.";
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to grant credits.";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await requireAdminApiUser(request);
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id: userId } = await params;
  if (!userId) {
    return NextResponse.json({ error: "missing_user_id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const credits = parsePositiveNumber((body as { credits?: unknown }).credits);
  if (credits === null) {
    return NextResponse.json({ error: "invalid_credits" }, { status: 400 });
  }

  const expiresInDays = parsePositiveInteger(
    (body as { billingCycleDays?: unknown }).billingCycleDays,
    90
  );
  const tokens = Math.max(1, Math.round(credits * TOKENS_PER_CREDIT));

  try {
    const subscription = await withTimeout(
      grantUserCredits({ expiresInDays, tokens, userId }),
      ADMIN_USER_CREDIT_GRANT_TIMEOUT_MS,
      () => {
        console.error(
          `[api/admin/users/credits] Grant timed out for user "${userId}".`,
          { timeoutMs: ADMIN_USER_CREDIT_GRANT_TIMEOUT_MS }
        );
      }
    );

    void withTimeout(
      createAuditLogEntry({
        actorId: actor.id,
        action: "billing.manual_credit.grant",
        target: { subscriptionId: subscription.id, userId },
        metadata: {
          credits,
          expiresInDays,
          tokens,
        },
      }),
      ADMIN_USER_CREDIT_AUDIT_TIMEOUT_MS
    ).catch((error) => {
      console.error(
        `[api/admin/users/credits] Audit log write failed for user "${userId}".`,
        error
      );
    });

    return NextResponse.json(
      {
        ok: true,
        credits,
        creditsRemaining: subscription.tokenBalance / TOKENS_PER_CREDIT,
        subscriptionId: subscription.id,
        tokens,
        tokensRemaining: subscription.tokenBalance,
      },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    console.error(
      `[api/admin/users/credits] Failed to grant credits for user "${userId}".`,
      error
    );
    return NextResponse.json(
      {
        error: "grant_failed",
        message: grantCreditsErrorMessage(error),
      },
      { headers: noStoreHeaders(), status: 500 }
    );
  }
}
