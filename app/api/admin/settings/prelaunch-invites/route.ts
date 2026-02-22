import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  createAuditLogEntry,
  createPrelaunchInviteToken,
  deletePrelaunchInviteToken,
  listActivePrelaunchInviteAccess,
  listPrelaunchInviteTokens,
  revokePrelaunchInviteAccessForUser,
  revokePrelaunchInviteToken,
} from "@/lib/db/queries";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";

const API_TIMEOUT_MS = 12_000;
const READ_TIMEOUT_MS = 8_000;
const AUDIT_TIMEOUT_MS = 3_000;

type InviteState = {
  invites: Awaited<ReturnType<typeof listPrelaunchInviteTokens>>;
  access: Awaited<ReturnType<typeof listActivePrelaunchInviteAccess>>;
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseMaxRedemptions(value: unknown): number {
  const rawValue = typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  const maxRedemptions = Number.isFinite(rawValue) ? Math.floor(rawValue) : 1;
  return Math.min(Math.max(maxRedemptions, 1), 10000);
}

async function requireAdminUser() {
  const session = await withTimeout(auth(), API_TIMEOUT_MS).catch(() => null);
  if (!session?.user || session.user.role !== "admin") {
    return null;
  }
  return session.user;
}

async function auditSafely(args: Parameters<typeof createAuditLogEntry>[0]) {
  await withTimeout(createAuditLogEntry(args), AUDIT_TIMEOUT_MS).catch(() => null);
}

async function loadInviteState(): Promise<InviteState> {
  const [invites, access] = await Promise.all([
    withTimeout(listPrelaunchInviteTokens({ limit: 100 }), READ_TIMEOUT_MS),
    withTimeout(listActivePrelaunchInviteAccess({ limit: 200 }), READ_TIMEOUT_MS),
  ]);

  return { invites, access };
}

export async function GET() {
  const user = await requireAdminUser();
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const state = await loadInviteState();
    return NextResponse.json(state, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(
      "[api/admin/settings/prelaunch-invites] Failed to load invite state.",
      error
    );
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await requireAdminUser();
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        action?: unknown;
        inviteId?: unknown;
        userId?: unknown;
        label?: unknown;
        maxRedemptions?: unknown;
      }
    | null;

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const action = normalizeString(body.action);
  if (!action) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  try {
    if (action === "create") {
      const labelRaw = normalizeString(body.label);
      const maxRedemptions = parseMaxRedemptions(body.maxRedemptions);
      const invite = await withTimeout(
        createPrelaunchInviteToken({
          createdByAdminId: user.id,
          label: labelRaw || null,
          maxRedemptions,
        }),
        API_TIMEOUT_MS
      );

      void auditSafely({
        actorId: user.id,
        action: "site.prelaunch_invite.create",
        target: { inviteId: invite.id },
        metadata: {
          inviteLabel: invite.label,
          maxRedemptions: invite.maxRedemptions,
        },
      });
    } else if (action === "revokeInvite") {
      const inviteId = normalizeString(body.inviteId);
      if (!inviteId) {
        return NextResponse.json({ error: "invalid_invite_id" }, { status: 400 });
      }
      const revoked = await withTimeout(
        revokePrelaunchInviteToken({
          inviteId,
          revokedByAdminId: user.id,
        }),
        API_TIMEOUT_MS
      );
      if (!revoked) {
        return NextResponse.json({ error: "invite_not_found" }, { status: 404 });
      }
      void auditSafely({
        actorId: user.id,
        action: "site.prelaunch_invite.revoke",
        target: { inviteId },
      });
    } else if (action === "deleteInvite") {
      const inviteId = normalizeString(body.inviteId);
      if (!inviteId) {
        return NextResponse.json({ error: "invalid_invite_id" }, { status: 400 });
      }
      const deleted = await withTimeout(
        deletePrelaunchInviteToken({ inviteId }),
        API_TIMEOUT_MS
      );
      if (!deleted) {
        return NextResponse.json({ error: "invite_not_found" }, { status: 404 });
      }
      void auditSafely({
        actorId: user.id,
        action: "site.prelaunch_invite.delete",
        target: { inviteId },
      });
    } else if (action === "revokeAccess") {
      const userId = normalizeString(body.userId);
      const inviteId = normalizeString(body.inviteId);
      if (!userId) {
        return NextResponse.json({ error: "invalid_user_id" }, { status: 400 });
      }
      const revoked = await withTimeout(
        revokePrelaunchInviteAccessForUser({
          userId,
          inviteId: inviteId || null,
          revokedByAdminId: user.id,
        }),
        API_TIMEOUT_MS
      );
      if (!revoked) {
        return NextResponse.json({ error: "access_not_found" }, { status: 404 });
      }
      void auditSafely({
        actorId: user.id,
        action: "site.prelaunch_invite_access.revoke",
        target: {
          userId,
          inviteId: inviteId || null,
        },
      });
    } else {
      return NextResponse.json({ error: "invalid_action" }, { status: 400 });
    }

    const state = await loadInviteState();
    return NextResponse.json(
      { ok: true, ...state },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error(
      "[api/admin/settings/prelaunch-invites] Failed to save invite state.",
      error
    );
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}
