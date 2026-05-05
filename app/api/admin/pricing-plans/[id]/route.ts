import { type NextRequest, NextResponse } from "next/server";
import { invalidateAdminMutation } from "@/lib/admin/cache-invalidation";
import { PRICING_PLAN_CACHE_TAG } from "@/lib/constants";
import {
  createAuditLogEntry,
  updatePricingPlan,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";
export const maxDuration = 30;

const PRICING_PLAN_AUDIT_TIMEOUT_MS = 3_000;

function parseBooleanInput(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on", "enabled"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off", "disabled"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function parseAndroidProductId(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    return { error: "invalid_android_product_id" } as const;
  }
  const productId = value.trim();
  if (!productId) {
    return null;
  }
  if (!/^[a-z0-9][a-z0-9_.]*$/.test(productId)) {
    return { error: "invalid_android_product_id" } as const;
  }
  return productId;
}

function parseNonNegativeNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}

function parseNonNegativeInteger(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0
    ? Math.floor(numberValue)
    : null;
}

function pricingPlanSaveError(error: unknown) {
  if (error instanceof ChatSDKError) {
    return error.cause ?? error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to save pricing plan.";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireAdminApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "missing_plan_id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "missing_name" }, { status: 400 });
  }

  const androidProductId = parseAndroidProductId(body.androidProductId);
  if (
    androidProductId &&
    typeof androidProductId === "object" &&
    "error" in androidProductId
  ) {
    return NextResponse.json(
      { error: androidProductId.error },
      { status: 400 }
    );
  }

  const priceInRupees = parseNonNegativeNumber(body.priceInRupees);
  const tokenAllowance = parseNonNegativeInteger(body.tokenAllowance);
  const billingCycleDays = parseNonNegativeInteger(body.billingCycleDays);
  const isActive = parseBooleanInput(body.isActive);

  if (
    priceInRupees === null ||
    tokenAllowance === null ||
    billingCycleDays === null ||
    isActive === null
  ) {
    return NextResponse.json({ error: "invalid_plan_values" }, { status: 400 });
  }

  try {
    const plan = await updatePricingPlan({
      id,
      updates: {
        name,
        description:
          typeof body.description === "string" ? body.description.trim() : "",
        androidProductId,
        priceInPaise: Math.max(0, Math.round(priceInRupees * 100)),
        tokenAllowance,
        billingCycleDays,
        isActive,
      },
    });

    if (!plan) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    invalidateAdminMutation({
      source: "billing.plan.update",
      tags: [PRICING_PLAN_CACHE_TAG],
    });

    void withTimeout(
      createAuditLogEntry({
        actorId: user.id,
        action: "billing.plan.update",
        target: { planId: id },
        metadata: {
          androidProductId,
          billingCycleDays,
          isActive,
          priceInPaise: plan.priceInPaise,
          tokenAllowance,
        },
      }),
      PRICING_PLAN_AUDIT_TIMEOUT_MS
    ).catch((error) => {
      console.error(
        `[api/admin/pricing-plans] Audit log write failed for plan "${id}".`,
        error
      );
    });

    return NextResponse.json(
      { ok: true, plan },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      `[api/admin/pricing-plans] Failed to update pricing plan "${id}".`,
      error
    );
    return NextResponse.json(
      {
        error: "save_failed",
        message: pricingPlanSaveError(error),
      },
      { status: 500 }
    );
  }
}
