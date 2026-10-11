import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createAccountDeletionRequestRecord,
  createAuditLogEntry,
  getUserById,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { getClientInfoFromHeaders } from "@/lib/security/client-info";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({
  dataAcknowledge: z.literal(true),
  notes: z.string().trim().max(2000).optional().default(""),
  permanentAcknowledge: z.literal(true),
  reason: z.enum([
    "no_longer_using",
    "privacy_concerns",
    "duplicate_account",
    "prefer_not_to_say",
    "other",
  ]),
});

export async function POST(request: Request) {
  const session = await getMobileSession(request);
  if (!session?.user) {
    return new ChatSDKError("unauthorized:api").toResponse();
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues.at(0)?.message ??
          "Confirm both acknowledgements before submitting.",
      },
      { status: 400 }
    );
  }

  const user = await getUserById(session.user.id);
  const email = user?.email?.trim().toLowerCase() ?? "";
  if (!user || !email) {
    return NextResponse.json(
      { error: "Your account does not include an email address. Please contact support." },
      { status: 400 }
    );
  }

  const headerStore = await headers();
  const clientKey = getClientKeyFromHeaders(headerStore);
  const limits = await Promise.all([
    incrementRateLimit(`account-deletion:user:${user.id}`, {
      limit: 3,
      windowMs: 24 * 60 * 60 * 1000,
    }),
    incrementRateLimit(`account-deletion:ip:${clientKey}`, {
      limit: 3,
      windowMs: 24 * 60 * 60 * 1000,
    }),
  ]);
  if (limits.some((result) => !result.allowed)) {
    return NextResponse.json(
      { error: "Too many deletion requests were submitted recently. Please wait before retrying." },
      { status: 429 }
    );
  }

  const clientInfo = await getClientInfoFromHeaders();
  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || email;
  const result = await createAccountDeletionRequestRecord({
    clientInfo,
    email,
    fullName,
    notes: parsed.data.notes || null,
    reason: parsed.data.reason,
    requestSource: "native_authenticated",
    requireEmailVerification: false,
    userId: user.id,
    usernameOrUserId: user.id,
  });

  await createAuditLogEntry({
    actorId: user.id,
    action: "user.account_deletion.request",
    target: {
      referenceId: result.request.referenceId,
      requestId: result.request.id,
      userId: user.id,
    },
    subjectUserId: user.id,
    ...clientInfo,
  });

  return NextResponse.json(
    {
      referenceId: result.request.referenceId,
      requiresEmailVerification: false,
      status: "success",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
