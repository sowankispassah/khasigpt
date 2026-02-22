import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  SITE_ADMIN_ENTRY_CODE_HASH_SETTING_KEY,
  SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY,
  SITE_ADMIN_ENTRY_PATH_SETTING_KEY,
  SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY,
  SITE_PUBLIC_LAUNCHED_SETTING_KEY,
  SITE_UNDER_MAINTENANCE_SETTING_KEY,
} from "@/lib/constants";
import {
  appSettingCacheTagForKey,
  createAuditLogEntry,
  getAppSettingsByKeysUncached,
  getAppSettingUncached,
  setAppSetting,
} from "@/lib/db/queries";
import { generateHashedPassword } from "@/lib/db/utils";
import { normalizeAdminEntryCodeInput } from "@/lib/security/admin-entry-pass";
import { parseBooleanSetting } from "@/lib/settings/boolean-setting";
import {
  normalizeAdminEntryPathSetting,
  sanitizeAdminEntryPathInput,
} from "@/lib/settings/admin-entry";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";

const API_TIMEOUT_MS = 12_000;
const READ_TIMEOUT_MS = 6_000;
const AUDIT_TIMEOUT_MS = 3_000;

const SITE_SETTING_KEYS = [
  SITE_PUBLIC_LAUNCHED_SETTING_KEY,
  SITE_UNDER_MAINTENANCE_SETTING_KEY,
  SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY,
  SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY,
  SITE_ADMIN_ENTRY_PATH_SETTING_KEY,
  SITE_ADMIN_ENTRY_CODE_HASH_SETTING_KEY,
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

async function requireAdminUser() {
  const session = await withTimeout(auth(), API_TIMEOUT_MS).catch(() => null);
  if (!session?.user || session.user.role !== "admin") {
    return null;
  }
  return session.user;
}

async function loadSiteAccessState(): Promise<SiteAccessState> {
  const settings = await withTimeout(
    getAppSettingsByKeysUncached([...SITE_SETTING_KEYS]),
    READ_TIMEOUT_MS
  );
  const map = new Map(settings.map((entry) => [entry.key, entry.value]));

  const publicLaunched = parseBooleanSetting(
    map.get(SITE_PUBLIC_LAUNCHED_SETTING_KEY),
    true
  );
  const underMaintenance = parseBooleanSetting(
    map.get(SITE_UNDER_MAINTENANCE_SETTING_KEY),
    false
  );
  const inviteOnlyPrelaunch = parseBooleanSetting(
    map.get(SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY),
    false
  );
  const adminAccessEnabled = parseBooleanSetting(
    map.get(SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY),
    false
  );
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

async function writeSettingAndVerify({
  key,
  value,
  verify,
}: {
  key: string;
  value: unknown;
  verify: (persisted: unknown) => boolean;
}) {
  await withTimeout(
    setAppSetting({
      key,
      value,
    }),
    API_TIMEOUT_MS
  );

  const persisted = await withTimeout(
    getAppSettingUncached<unknown>(key),
    READ_TIMEOUT_MS
  );
  if (!verify(persisted)) {
    throw new Error("persisted_value_mismatch");
  }

  revalidateTag(appSettingCacheTagForKey(key));
}

async function auditSafely(args: Parameters<typeof createAuditLogEntry>[0]) {
  await withTimeout(createAuditLogEntry(args), AUDIT_TIMEOUT_MS).catch(() => null);
}

export async function GET() {
  const user = await requireAdminUser();
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
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

export async function POST(request: Request) {
  const user = await requireAdminUser();
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
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

      await writeSettingAndVerify({
        key: settingKey,
        value: enabled,
        verify: (persisted) => parseBooleanSetting(persisted, !enabled) === enabled,
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

      await writeSettingAndVerify({
        key: SITE_ADMIN_ENTRY_PATH_SETTING_KEY,
        value: path,
        verify: (persisted) => normalizeAdminEntryPathSetting(persisted) === path,
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
      await writeSettingAndVerify({
        key: SITE_ADMIN_ENTRY_CODE_HASH_SETTING_KEY,
        value: hash,
        verify: (persisted) => typeof persisted === "string" && persisted === hash,
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
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}
