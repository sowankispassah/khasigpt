import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  getPricingPlanById,
  getUserById,
  listUserCreditHistory,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

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
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "invalid_user" }, { status: 400 });
  }

  const history = await listUserCreditHistory({ userId: id, limit: 8 });
  const actorIds = Array.from(new Set(history.map((entry) => entry.actorId)));
  const planIds = Array.from(
    new Set(
      history
        .map((entry) => getPlanId(entry))
        .filter((planId): planId is string => typeof planId === "string")
    )
  );

  const [actors, plans] = await Promise.all([
    Promise.all(actorIds.map((actorId) => getUserById(actorId))),
    Promise.all(
      planIds.map((planId) => getPricingPlanById({ id: planId, includeDeleted: true }))
    ),
  ]);

  const actorEmailById = new Map(
    actors.flatMap((actor) => (actor ? ([[actor.id, actor.email]] as const) : []))
  );
  const planNameById = new Map(
    plans.flatMap((plan) => (plan ? ([[plan.id, plan.name]] as const) : []))
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
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
