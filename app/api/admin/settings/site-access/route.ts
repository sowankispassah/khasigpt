import { type NextRequest, NextResponse } from "next/server";
import { invalidateAdminMutation } from "@/lib/admin/cache-invalidation";
import {
  SITE_ADMIN_ENTRY_CODE_HASH_SETTING_KEY,
  SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY,
  SITE_ADMIN_ENTRY_PATH_SETTING_KEY,
  SITE_LEGACY_LAUNCH_MODE_SETTING_KEY,
  SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY,
  SITE_PUBLIC_LAUNCHED_SETTING_KEY,
  SITE_UNDER_MAINTENANCE_SETTING_KEY,
} from "@/lib/constants";
import {
  appSettingCacheTagForKey,
  createLiteAuditLogEntry,
  getLiteAppSettingsByKeysUncached,
  setLiteAppSetting,
} from "@/lib/db/app-settings-lite";
import { generateHashedPassword } from "@/lib/db/utils";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { normalizeAdminEntryCodeInput } from "@/lib/security/admin-entry-pass";
import {
  normalizeAdminEntryPathSetting,
  sanitizeAdminEntryPathInput,
} from "@/lib/settings/admin-entry";
import { parseBooleanSetting } from "@/lib/settings/boolean-setting";
import {
  parseLegacySiteLaunchMode,
  resolveAdminAccessEnabledSetting,
  resolvePublicLaunchedSetting,
} from "@/lib/settings/site-launch";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";

const READ_TIMEOUT_MS = 12_000;
const AUDIT_TIMEOUT_MS = 3_000;
const WRITE_TIMEOUT_MS = 12_000;

const SITE_SETTING_KEYS = [
  SITE_PUBLIC_LAUNCHED_SETTING_KEY,
  SITE_UNDER_MAINTENANCE_SETTING_KEY,
  SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY,
  SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY,
  SITE_ADMIN_ENTRY_PATH_SETTING_KEY,
  SITE_ADMIN_ENTRY_CODE_HASH_SETTING_KEY,
  SITE_LEGACY_LAUNCH_MODE_SETTING_KEY,
] as const;

const TOGGLE_FIELD_MAP: Record<string, string> = {
  publicLaunched: SITE_PUBLIC_LAUNCHED_SETTING_KEY,
  underMaintenance: SITE_UNDER_MAINTENANCE_SETTING_KEY,
  inviteOnlyPrelaunch: SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY,
  adminAccessEnabled: SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY,
};

type SiteAccessState = {
  publicLaunched: boolean;
  underMaintenance: boolean;
  inviteOnlyPrelaunch: boolean;
  adminAccessEnabled: boolean;
  adminEntryPath: string;
  adminEntryCodeConfigured: boolean;
};

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

async function loadSiteAccessState(): Promise<SiteAccessState> {
  const settings = await withTimeout(
    getLiteAppSettingsByKeysUncached([...SITE_SETTING_KEYS]),
    READ_TIMEOUT_MS
  );
  const map = new Map(settings.map((entry) => [entry.key, entry.value]));
  const legacyLaunchMode = parseLegacySiteLaunchMode(
    map.get(SITE_LEGACY_LAUNCH_MODE_SETTING_KEY)
  );

  const publicLaunched = resolvePublicLaunchedSetting({
    fallback: true,
    legacyMode: legacyLaunchMode,
    value: map.get(SITE_PUBLIC_LAUNCHED_SETTING_KEY),
  });
  const underMaintenance = parseBooleanSetting(
    map.get(SITE_UNDER_MAINTENANCE_SETTING_KEY),
    false
  );
  const inviteOnlyPrelaunch = parseBooleanSetting(
    map.get(SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY),
    false
  );
  const adminAccessEnabled = resolveAdminAccessEnabledSetting({
    fallback: false,
    legacyMode: legacyLaunchMode,
    value: map.get(SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY),
  });
  const adminEntryPath = normalizeAdminEntryPathSetting(
    map.get(SITE_ADMIN_ENTRY_PATH_SETTING_KEY)
  );
  const adminEntryCodeHash = map.get(SITE_ADMIN_ENTRY_CODE_HASH_SETTING_KEY);
  const adminEntryCodeConfigured =
    typeof adminEntryCodeHash === "string" && adminEntryCodeHash.trim().length > 0;

  return {
    publicLaunched,
    underMaintenance,
    inviteOnlyPrelaunch,
    adminAccessEnabled,
    adminEntryPath,
    adminEntryCodeConfigured,
  };
}

async function writeSetting({
  key,
  source,
  value,
}: {
  key: string;
  source: string;
  value: unknown;
}) {
  await withTimeout(
    setLiteAppSetting({
      key,
      value,
    }),
    WRITE_TIMEOUT_MS
  );

  invalidateAdminMutation({
    source,
    tags: [appSettingCacheTagForKey(key)],
  });
}

async function auditSafely(args: Parameters<typeof createLiteAuditLogEntry>[0]) {
  await withTimeout(createLiteAuditLogEntry(args), AUDIT_TIMEOUT_MS).catch(
    () => null
  );
}

export async function GET(request: NextRequest) {
  const user = await requireAdminApiUser(request);
  if (!user) {
    return NextResponse.json(
      {
        error: "forbidden",
        message:
          "Your admin session was not accepted. Please refresh and sign in again.",
      },
      { status: 403 }
    );
  }

  try {
    const state = await loadSiteAccessState();
    return NextResponse.json(state, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[api/admin/settings/site-access] Failed to load state.", error);
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await requireAdminApiUser(request);
  if (!user) {
    return NextResponse.json(
      {
        error: "forbidden",
        message:
          "Your admin session was not accepted. Please refresh and sign in again.",
      },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const action =
    "action" in body && typeof body.action === "string" ? body.action : "";

  try {
    if (action === "toggle") {
      const fieldName =
        "fieldName" in body && typeof body.fieldName === "string"
          ? body.fieldName
          : "";
      const settingKey = TOGGLE_FIELD_MAP[fieldName];
      if (!settingKey) {
        return NextResponse.json({ error: "invalid_field" }, { status: 400 });
      }
      const enabled = parseBooleanInput((body as { enabled?: unknown }).enabled);
      if (enabled === null) {
        return NextResponse.json({ error: "invalid_value" }, { status: 400 });
      }

      await writeSetting({
        key: settingKey,
        source: `site.${fieldName}.toggle`,
        value: enabled,
      });
      void auditSafely({
        actorId: user.id,
        action: `site.${fieldName}.toggle`,
        target: { setting: settingKey },
        metadata: { enabled },
      });
    } else if (action === "setPath") {
      const rawPath =
        "path" in body && typeof body.path === "string" ? body.path : "";
      const path = sanitizeAdminEntryPathInput(rawPath);
      if (!path) {
        return NextResponse.json({ error: "invalid_path" }, { status: 400 });
      }

      await writeSetting({
        key: SITE_ADMIN_ENTRY_PATH_SETTING_KEY,
        source: "site.admin_entry_path.update",
        value: path,
      });
      void auditSafely({
        actorId: user.id,
        action: "site.admin_entry_path.update",
        target: { setting: SITE_ADMIN_ENTRY_PATH_SETTING_KEY },
        metadata: { path },
      });
    } else if (action === "setCode") {
      const rawCode =
        "code" in body && typeof body.code === "string" ? body.code : "";
      const code = normalizeAdminEntryCodeInput(rawCode);
      if (!code) {
        return NextResponse.json({ error: "invalid_code" }, { status: 400 });
      }

      const hash = generateHashedPassword(code);
      await writeSetting({
        key: SITE_ADMIN_ENTRY_CODE_HASH_SETTING_KEY,
        source: "site.admin_entry_code.update",
        value: hash,
      });
      void auditSafely({
        actorId: user.id,
        action: "site.admin_entry_code.update",
        target: { setting: SITE_ADMIN_ENTRY_CODE_HASH_SETTING_KEY },
        metadata: { updated: true, length: code.length },
      });
    } else {
      return NextResponse.json({ error: "invalid_action" }, { status: 400 });
    }

    const state = await loadSiteAccessState();
    return NextResponse.json(
      { ok: true, state },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error("[api/admin/settings/site-access] Failed to save state.", error);
    return NextResponse.json(
      {
        error: "save_failed",
        message: "The server could not save this setting. Please retry.",
      },
      { status: 500 }
    );
  }
}
