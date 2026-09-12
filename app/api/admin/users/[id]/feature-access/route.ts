import { type NextRequest, NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/api/cache";
import {
  createAuditLogEntry,
  getUserById,
  getUserFeatureAccessOverrides,
  replaceUserFeatureAccessOverrides,
} from "@/lib/db/queries";
import { isFeatureEnabledForRole, parseFeatureAccessMode } from "@/lib/feature-access";
import {
  isUserFeatureAccessKey,
  USER_FEATURE_ACCESS_KEYS,
  USER_FEATURE_DEFINITIONS,
} from "@/lib/feature-access-catalog";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import {
  getFeatureAccessModeSettingValue,
  loadFeatureAccessSettingsByKeys,
} from "@/lib/settings/feature-access-settings";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";
export const maxDuration = 30;

const READ_TIMEOUT_MS = 8_000;
const WRITE_TIMEOUT_MS = 10_000;
const AUDIT_TIMEOUT_MS = 3_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function buildResponse(userId: string) {
  const [target, globalSettings, overrides] = await Promise.all([
    withTimeout(getUserById(userId), READ_TIMEOUT_MS),
    loadFeatureAccessSettingsByKeys(USER_FEATURE_ACCESS_KEYS, {
      source: "admin.users.feature-access",
      timeoutMs: READ_TIMEOUT_MS,
    }),
    withTimeout(
      getUserFeatureAccessOverrides(userId, USER_FEATURE_ACCESS_KEYS),
      READ_TIMEOUT_MS
    ),
  ]);

  if (!target) {
    return null;
  }
  if (globalSettings.status === "unavailable") {
    throw new Error("global_feature_settings_unavailable");
  }

  return {
    features: USER_FEATURE_DEFINITIONS.map((feature) => {
      const globalMode = parseFeatureAccessMode(
        getFeatureAccessModeSettingValue(globalSettings, feature.settingKey, {
          unconfirmedFallback: feature.fallbackMode,
        }),
        feature.fallbackMode
      );
      const override = overrides.get(feature.settingKey) ?? null;
      const globalEnabled = isFeatureEnabledForRole(globalMode, target.role);
      return {
        ...feature,
        effectiveEnabled: isFeatureEnabledForRole(
          globalMode,
          target.role,
          override
        ),
        globalMode,
        globalEnabled,
        override,
      };
    }),
    meta: {
      degraded: globalSettings.status !== "confirmed",
      globalSettingsStatus: globalSettings.status,
    },
    user: { email: target.email, id: target.id, role: target.role },
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await requireAdminApiUser(request);
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id: userId } = await params;
  if (!UUID_PATTERN.test(userId)) {
    return NextResponse.json(
      { error: "invalid_user_id" },
      { headers: noStoreHeaders(), status: 400 }
    );
  }

  try {
    const data = await buildResponse(userId);
    if (!data) {
      return NextResponse.json(
        { error: "not_found" },
        { headers: noStoreHeaders(), status: 404 }
      );
    }
    return NextResponse.json(data, { headers: noStoreHeaders() });
  } catch (error) {
    console.error(`[api/admin/users/${userId}/feature-access] Read failed.`, error);
    return NextResponse.json(
      {
        error: "feature_access_unavailable",
        message: "Feature access could not be confirmed. Please retry.",
      },
      { headers: noStoreHeaders(), status: 503 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await requireAdminApiUser(request);
  if (!actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id: userId } = await params;
  if (!UUID_PATTERN.test(userId)) {
    return NextResponse.json(
      { error: "invalid_user_id" },
      { headers: noStoreHeaders(), status: 400 }
    );
  }

  const body = await request.json().catch(() => null);
  const rawOverrides =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as { overrides?: unknown }).overrides
      : null;
  if (!rawOverrides || typeof rawOverrides !== "object" || Array.isArray(rawOverrides)) {
    return NextResponse.json(
      { error: "invalid_payload" },
      { headers: noStoreHeaders(), status: 400 }
    );
  }

  const overrides = new Map<string, boolean>();
  for (const [key, value] of Object.entries(rawOverrides)) {
    if (!isUserFeatureAccessKey(key) || (value !== null && typeof value !== "boolean")) {
      return NextResponse.json(
        { error: "invalid_feature_override" },
        { headers: noStoreHeaders(), status: 400 }
      );
    }
    if (typeof value === "boolean") {
      overrides.set(key, value);
    }
  }

  try {
    const target = await withTimeout(getUserById(userId), READ_TIMEOUT_MS);
    if (!target) {
      return NextResponse.json(
        { error: "not_found" },
        { headers: noStoreHeaders(), status: 404 }
      );
    }

    await withTimeout(
      replaceUserFeatureAccessOverrides({ actorId: actor.id, overrides, userId }),
      WRITE_TIMEOUT_MS
    );

    void withTimeout(
      createAuditLogEntry({
        action: "user.feature_access.update",
        actorId: actor.id,
        metadata: { overrides: Object.fromEntries(overrides) },
        target: { userId },
      }),
      AUDIT_TIMEOUT_MS
    ).catch((error) => {
      console.error(`[api/admin/users/${userId}/feature-access] Audit failed.`, error);
    });

    const data = await buildResponse(userId);
    return NextResponse.json({ ok: true, ...data }, { headers: noStoreHeaders() });
  } catch (error) {
    console.error(`[api/admin/users/${userId}/feature-access] Save failed.`, error);
    return NextResponse.json(
      {
        error: "feature_access_save_failed",
        message: "Feature access could not be saved. Please retry.",
      },
      { headers: noStoreHeaders(), status: 500 }
    );
  }
}
