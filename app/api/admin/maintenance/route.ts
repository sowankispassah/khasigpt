import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  SITE_PUBLIC_LAUNCHED_SETTING_KEY,
  SITE_UNDER_MAINTENANCE_SETTING_KEY,
} from "@/lib/constants";
import {
  appSettingCacheTagForKey,
  createAuditLogEntry,
  setAppSetting,
} from "@/lib/db/queries";
import { withTimeout } from "@/lib/utils/async";

type MaintenanceFieldConfig = {
  auditAction: string;
  settingKey: string;
};

const MAINTENANCE_TIMEOUT_MS = 10_000;
const MAINTENANCE_AUDIT_TIMEOUT_MS = 3_000;

const MAINTENANCE_FIELD_CONFIG: Record<string, MaintenanceFieldConfig> = {
  publicLaunched: {
    settingKey: SITE_PUBLIC_LAUNCHED_SETTING_KEY,
    auditAction: "site.public_launch.toggle",
  },
  underMaintenance: {
    settingKey: SITE_UNDER_MAINTENANCE_SETTING_KEY,
    auditAction: "site.maintenance.toggle",
  },
};

export const runtime = "nodejs";

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

export async function POST(request: Request) {
  const session = await withTimeout(auth(), MAINTENANCE_TIMEOUT_MS).catch(
    () => null
  );
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const fieldName =
    body && typeof body === "object" && "fieldName" in body
      ? (body as { fieldName?: unknown }).fieldName
      : null;
  const enabledRaw =
    body && typeof body === "object" && "enabled" in body
      ? (body as { enabled?: unknown }).enabled
      : null;

  if (typeof fieldName !== "string" || !fieldName.trim()) {
    return NextResponse.json({ error: "invalid_field" }, { status: 400 });
  }

  const enabled = parseBooleanInput(enabledRaw);
  if (enabled === null) {
    return NextResponse.json({ error: "invalid_value" }, { status: 400 });
  }

  const config = MAINTENANCE_FIELD_CONFIG[fieldName];
  if (!config) {
    return NextResponse.json({ error: "unknown_field" }, { status: 400 });
  }

  try {
    await withTimeout(
      setAppSetting({
        key: config.settingKey,
        value: enabled,
      }),
      MAINTENANCE_TIMEOUT_MS
    );
  } catch (error) {
    console.error(
      `[api/admin/maintenance] Failed to save setting "${config.settingKey}".`,
      error
    );
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  revalidateTag(appSettingCacheTagForKey(config.settingKey));

  void withTimeout(
    createAuditLogEntry({
      actorId: session.user.id,
      action: config.auditAction,
      target: { setting: config.settingKey },
      metadata: { enabled },
    }),
    MAINTENANCE_AUDIT_TIMEOUT_MS
  ).catch((error) => {
    console.error(
      `[api/admin/maintenance] Audit log write failed for "${config.settingKey}".`,
      error
    );
    return null;
  });

  return NextResponse.json(
    { ok: true, enabled },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
