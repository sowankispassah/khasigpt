import { type NextRequest, NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/api/cache";
import {
  getPricingPlanNamesByIds,
  getUserEmailsByIds,
  listUserCreditHistory,
} from "@/lib/db/queries";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";

const CREDIT_HISTORY_READ_TIMEOUT_MS = 5000;

function getPlanId(entry: {
  action: string;
  metadata: Record<string, unknown> | null;
  target: Record<string, unknown> | null;
}) {
  if (entry.action !== "billing.recharge") {
    return null;
  }

  const metadataPlanId =
    typeof entry.metadata?.planId === "string" ? entry.metadata.planId : null;
  const targetPlanId =
    typeof entry.target?.planId === "string" ? entry.target.planId : null;

  return metadataPlanId ?? targetPlanId;
}

function describeCreditHistoryEntry(
  entry: {
    action: string;
    actorId: string;
    metadata: Record<string, unknown> | null;
    target: Record<string, unknown> | null;
  },
  actorEmailById: Map<string, string>,
  planNameById: Map<string, string>
) {
  if (entry.action === "billing.manual_credit.grant") {
    const credits =
      typeof entry.metadata?.credits === "number" ? entry.metadata.credits : null;
    const tokens =
      typeof entry.metadata?.tokens === "number" ? entry.metadata.tokens : null;
    const expiresInDays =
      typeof entry.metadata?.expiresInDays === "number"
        ? entry.metadata.expiresInDays
        : null;
    const actor = actorEmailById.get(entry.actorId) ?? "Admin";

    const parts = [
      `${actor} granted${credits !== null ? ` ${credits.toLocaleString()} credits` : ""}`,
    ];
    if (tokens !== null) {
      parts.push(`(${tokens.toLocaleString()} tokens)`);
    }
    if (expiresInDays !== null) {
      parts.push(
        `expires in ${expiresInDays} day${expiresInDays === 1 ? "" : "s"}`
      );
    }

    return parts.join(" | ");
  }

  if (entry.action === "billing.recharge") {
    const planId = getPlanId(entry);
    const planName = (planId ? planNameById.get(planId) : null) ?? planId ?? "Plan";
    return `User activated ${planName}`;
  }

  return entry.action;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminApiUser(request);
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "invalid_user" }, { status: 400 });
  }

  try {
    const history = await withTimeout(
      listUserCreditHistory({ userId: id, limit: 8 }),
      CREDIT_HISTORY_READ_TIMEOUT_MS,
      () => {
        console.error("[api/admin/users/credit-history] History read timed out.", {
          timeoutMs: CREDIT_HISTORY_READ_TIMEOUT_MS,
          userId: id,
        });
      }
    );
    const actorIds = Array.from(new Set(history.map((entry) => entry.actorId)));
    const planIds = Array.from(
      new Set(
        history
          .map((entry) => getPlanId(entry))
          .filter((planId): planId is string => typeof planId === "string")
      )
    );

    const [actorEmailById, planNameById] = await withTimeout(
      Promise.all([
        getUserEmailsByIds(actorIds),
        getPricingPlanNamesByIds({ includeDeleted: true, planIds }),
      ]),
      CREDIT_HISTORY_READ_TIMEOUT_MS,
      () => {
        console.error(
          "[api/admin/users/credit-history] Detail lookup timed out.",
          {
            timeoutMs: CREDIT_HISTORY_READ_TIMEOUT_MS,
            userId: id,
          }
        );
      }
    );

    return NextResponse.json(
      {
        entries: history.map((entry) => ({
          createdAt: new Date(entry.createdAt).toISOString(),
          description: describeCreditHistoryEntry(
            entry,
            actorEmailById,
            planNameById
          ),
          id: entry.id,
        })),
      },
      {
        headers: noStoreHeaders(),
      }
    );
  } catch (error) {
    console.error(
      `[api/admin/users/credit-history] Failed to load credit history for user "${id}".`,
      error
    );
    return NextResponse.json(
      {
        error: "credit_history_unavailable",
        message: "Credit history is unavailable. Please retry this section.",
      },
      { headers: noStoreHeaders(), status: 503 }
    );
  }
}
